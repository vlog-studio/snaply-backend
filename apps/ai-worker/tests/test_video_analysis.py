"""스냅 내용 분석 스파이크의 순수 로직 테스트.

외부 바이너리(ffmpeg)와 SDK(openai) 없이 돌아야 한다 — 기준선 숫자를 만드는 계산이
틀리면 스파이크의 결론 전체가 틀리므로, 계산은 호출과 분리해 여기서 잡는다.

    cd apps/ai-worker && python -m unittest tests.test_analysis_spike
"""

import csv
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts" / "analysis-spike"))

import frame_sampler  # noqa: E402
import report  # noqa: E402
import vision_client  # noqa: E402
from result_schema import ResultSchemaError, validate_result  # noqa: E402


def _valid_payload() -> dict:
    return {
        "summary": "  카페 테이블 위의 디저트를 가까이서 촬영한 영상  ",
        "topics": ["카페", "디저트"],
        "places": ["카페"],
        "objects": ["케이크", "커피"],
        "actions": ["디저트를 가까이 보여줌"],
        "moods": ["차분한"],
        "visualQuality": {"score": 0.86, "issues": [], "usableForEdit": True},
        "confidence": 0.91,
    }


def _row(model: str, status: str = "success", **overrides) -> dict:
    row = {
        "video": "a.mp4",
        "model": model,
        "status": status,
        "errorCode": None,
        "frameCount": 4,
        "durationMs": 3012,
        "latencyMs": 1200,
        "inputTokens": 800,
        "outputTokens": 120,
        "costUsd": None,
        "result": validate_result(_valid_payload()) if status == "success" else None,
    }
    row.update(overrides)
    return row


class FrameTimestampTest(unittest.TestCase):
    def test_three_second_video_matches_planned_positions(self) -> None:
        # 계획 문서 §7 의 0.3 / 1.1 / 1.9 / 2.7 초.
        self.assertEqual(frame_sampler.frame_timestamps_ms(3000), [300, 1101, 1899, 2700])

    def test_first_and_last_frame_are_never_used(self) -> None:
        timestamps = frame_sampler.frame_timestamps_ms(3000)
        self.assertTrue(all(0 < value < 3000 for value in timestamps))

    def test_very_short_video_collapses_near_duplicates(self) -> None:
        # 400ms 영상은 시점 간격이 최소 간격보다 좁아 4장을 만들지 않는다.
        timestamps = frame_sampler.frame_timestamps_ms(400)
        self.assertEqual(timestamps, [40, 253])

    def test_zero_length_video_yields_no_timestamps(self) -> None:
        self.assertEqual(frame_sampler.frame_timestamps_ms(0), [])


class DurationParseTest(unittest.TestCase):
    def test_parses_ffprobe_json(self) -> None:
        stdout = json.dumps({"format": {"duration": "3.012000"}})
        self.assertEqual(frame_sampler.parse_duration_ms(stdout), 3012)

    def test_rejects_non_positive_duration(self) -> None:
        with self.assertRaises(ValueError):
            frame_sampler.parse_duration_ms(json.dumps({"format": {"duration": "0"}}))


class ExtractCommandTest(unittest.TestCase):
    def setUp(self) -> None:
        self.frames = [(300, "/tmp/f0.jpg"), (1101, "/tmp/f1.jpg"), (1899, "/tmp/f2.jpg")]
        self.cmd = frame_sampler.build_extract_command("in.mp4", self.frames)

    def test_single_ffmpeg_invocation_with_one_input(self) -> None:
        # 프레임마다 프로세스를 띄우지 않는다 — 계획 문서 §7.
        self.assertEqual(self.cmd.count("-i"), 1)
        self.assertEqual(self.cmd[0], "ffmpeg")

    def test_every_frame_has_its_own_seek_and_output(self) -> None:
        self.assertEqual(self.cmd.count("-ss"), 3)
        self.assertEqual(self.cmd.count("-frames:v"), 3)
        self.assertEqual([self.cmd[self.cmd.index("-ss") + 1]], ["0.300"])
        for _, path in self.frames:
            self.assertIn(path, self.cmd)

    def test_frames_are_downscaled(self) -> None:
        self.assertTrue(any("scale=" in part for part in self.cmd))

    def test_empty_frame_list_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            frame_sampler.build_extract_command("in.mp4", [])


class FrameDedupeTest(unittest.TestCase):
    def test_average_hash_sets_bits_above_mean(self) -> None:
        data = bytes([0] * 32 + [255] * 32)
        value = frame_sampler.ahash_from_gray_bytes(data)
        self.assertEqual(bin(value).count("1"), 32)

    def test_rejects_wrong_frame_size(self) -> None:
        with self.assertRaises(ValueError):
            frame_sampler.ahash_from_gray_bytes(b"\x00" * 10)

    def test_identical_frames_keep_only_one(self) -> None:
        # 거의 같은 화면만 반복되는 영상에 4장을 올리면 토큰만 쓰고 정보가 늘지 않는다.
        self.assertEqual(frame_sampler.dedupe_indices([7, 7, 7, 7]), [0])

    def test_distinct_frames_are_all_kept(self) -> None:
        hashes = [0, (1 << 40) - 1, 0xFFFFFFFFFFFFFFFF]
        self.assertEqual(frame_sampler.dedupe_indices(hashes), [0, 1, 2])

    def test_near_duplicate_within_threshold_is_dropped(self) -> None:
        base = 0
        near = 0b1111  # 해밍 거리 4 ≤ 임계값 5
        self.assertEqual(frame_sampler.dedupe_indices([base, near]), [0])


class RequestBuildTest(unittest.TestCase):
    def setUp(self) -> None:
        self.urls = ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"]
        self.request = vision_client.build_request("m1", self.urls)

    def test_all_frames_go_in_one_request_in_order(self) -> None:
        content = self.request["input"][1]["content"]
        images = [item["image_url"] for item in content if item["type"] == "input_image"]
        self.assertEqual(images, self.urls)

    def test_every_image_uses_low_detail(self) -> None:
        content = self.request["input"][1]["content"]
        details = {item["detail"] for item in content if item["type"] == "input_image"}
        self.assertEqual(details, {"low"})

    def test_structured_output_is_strict(self) -> None:
        fmt = self.request["text"]["format"]
        self.assertEqual(fmt["type"], "json_schema")
        self.assertTrue(fmt["strict"])
        self.assertFalse(fmt["schema"]["additionalProperties"])

    def test_reasoning_is_omitted_unless_requested(self) -> None:
        # 추론 파라미터를 지원하지 않는 모델도 비교 대상이다.
        self.assertNotIn("reasoning", self.request)
        with_effort = vision_client.build_request("m1", self.urls, reasoning_effort="none")
        self.assertEqual(with_effort["reasoning"], {"effort": "none"})

    def test_request_without_images_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            vision_client.build_request("m1", [])


class FailureClassificationTest(unittest.TestCase):
    def test_retryable_failures(self) -> None:
        for status, name, expected in (
            (429, "RateLimitError", "RATE_LIMITED"),
            (503, "APIStatusError", "UPSTREAM_ERROR"),
            (None, "APITimeoutError", "TIMEOUT"),
            (None, "APIConnectionError", "NETWORK"),
        ):
            code, retryable = vision_client.classify_failure(status, name, "")
            self.assertEqual(code, expected)
            self.assertTrue(retryable, expected)

    def test_non_retryable_failures(self) -> None:
        for status, name, message, expected in (
            (401, "AuthenticationError", "", "AUTH_FAILED"),
            (400, "BadRequestError", "", "BAD_REQUEST"),
            (404, "NotFoundError", "", "MODEL_NOT_FOUND"),
            (400, "BadRequestError", "content_policy violation", "SAFETY_REFUSED"),
        ):
            code, retryable = vision_client.classify_failure(status, name, message)
            self.assertEqual(code, expected)
            self.assertFalse(retryable, expected)


class CostTest(unittest.TestCase):
    def test_missing_price_returns_none_instead_of_guessing(self) -> None:
        # 스냅당 단가가 스파이크의 산출물이므로 임의 값을 채우면 결론이 오염된다.
        self.assertIsNone(vision_client.compute_cost_usd(1000, 100, None, None))
        self.assertIsNone(vision_client.compute_cost_usd(1000, 100, 1.0, None))

    def test_computes_from_per_million_prices(self) -> None:
        cost = vision_client.compute_cost_usd(1_000_000, 500_000, 0.3, 1.2)
        self.assertAlmostEqual(cost, 0.9)

    def test_missing_token_counts_are_treated_as_zero(self) -> None:
        self.assertAlmostEqual(vision_client.compute_cost_usd(None, None, 1.0, 1.0), 0.0)


class ResponseReadTest(unittest.TestCase):
    def test_reads_output_text_from_response_payload(self) -> None:
        payload = {
            "id": "resp_1",
            "usage": {"input_tokens": 700, "output_tokens": 90},
            "output": [{"content": [{"type": "output_text", "text": '{"a":1}'}]}],
        }
        self.assertEqual(vision_client.extract_output_text(payload), '{"a":1}')
        self.assertEqual(vision_client.read_usage(payload), (700, 90, "resp_1"))

    def test_empty_output_is_a_classified_failure(self) -> None:
        with self.assertRaises(vision_client.VisionCallError) as caught:
            vision_client.extract_output_text({"output": []})
        self.assertEqual(caught.exception.code, "EMPTY_OUTPUT")

    def test_non_json_body_is_retryable_schema_failure(self) -> None:
        with self.assertRaises(vision_client.VisionCallError) as caught:
            vision_client.parse_output_json("not json")
        self.assertEqual(caught.exception.code, "SCHEMA_INVALID")
        self.assertTrue(caught.exception.retryable)


class ResultValidationTest(unittest.TestCase):
    def test_valid_payload_is_normalized(self) -> None:
        result = validate_result(_valid_payload())
        self.assertEqual(result["summary"], "카페 테이블 위의 디저트를 가까이서 촬영한 영상")
        self.assertEqual(result["objects"], ["케이크", "커피"])
        self.assertTrue(result["visualQuality"]["usableForEdit"])

    def test_rejects_score_outside_unit_range(self) -> None:
        payload = _valid_payload()
        payload["visualQuality"]["score"] = 1.4
        with self.assertRaises(ResultSchemaError):
            validate_result(payload)

    def test_rejects_empty_summary(self) -> None:
        payload = _valid_payload()
        payload["summary"] = "   "
        with self.assertRaises(ResultSchemaError):
            validate_result(payload)

    def test_rejects_unknown_visual_issue_code(self) -> None:
        # 자유 텍스트 issue 를 받으면 집계가 불가능하다.
        payload = _valid_payload()
        payload["visualQuality"]["issues"] = ["느낌이 이상함"]
        with self.assertRaises(ResultSchemaError):
            validate_result(payload)

    def test_rejects_non_boolean_usable_flag(self) -> None:
        payload = _valid_payload()
        payload["visualQuality"]["usableForEdit"] = "true"
        with self.assertRaises(ResultSchemaError):
            validate_result(payload)

    def test_rejects_overlong_list(self) -> None:
        payload = _valid_payload()
        payload["topics"] = [f"주제{index}" for index in range(7)]
        with self.assertRaises(ResultSchemaError):
            validate_result(payload)

    def test_rejects_blank_list_item(self) -> None:
        payload = _valid_payload()
        payload["objects"] = ["케이크", " "]
        with self.assertRaises(ResultSchemaError):
            validate_result(payload)


class AggregateTest(unittest.TestCase):
    def test_percentile_uses_nearest_rank(self) -> None:
        self.assertEqual(report.percentile([10, 20, 30, 40], 0.5), 30)
        self.assertEqual(report.percentile([10, 20, 30, 40], 0.95), 40)
        self.assertIsNone(report.percentile([], 0.5))

    def test_success_rate_and_error_codes_per_model(self) -> None:
        rows = [
            _row("m1"),
            _row("m1", status="failed", errorCode="RATE_LIMITED"),
            _row("m2"),
        ]
        summary = report.aggregate(rows)
        self.assertEqual(summary["m1"]["successRate"], 0.5)
        self.assertEqual(summary["m1"]["errorCodes"], {"RATE_LIMITED": 1})
        self.assertEqual(summary["m2"]["successRate"], 1.0)

    def test_cost_is_averaged_only_over_priced_rows(self) -> None:
        rows = [_row("m1", costUsd=0.002), _row("m1", costUsd=None)]
        stats = report.aggregate(rows)["m1"]
        self.assertAlmostEqual(stats["meanCostUsdPerSnap"], 0.002)
        self.assertEqual(stats["costSampleSize"], 1)

    def test_cost_stays_none_when_no_price_was_configured(self) -> None:
        stats = report.aggregate([_row("m1"), _row("m1")])["m1"]
        self.assertIsNone(stats["meanCostUsdPerSnap"])

    def test_failed_rows_do_not_pollute_latency(self) -> None:
        rows = [_row("m1", latencyMs=1000), _row("m1", status="failed", errorCode="TIMEOUT")]
        self.assertEqual(report.aggregate(rows)["m1"]["latencyP50Ms"], 1000)


class LabelSheetTest(unittest.TestCase):
    def test_sheet_has_empty_human_columns(self) -> None:
        with tempfile.TemporaryDirectory() as work_dir:
            path = str(Path(work_dir) / "labels.csv")
            report.write_label_sheet([_row("m1")], path)
            with open(path, encoding="utf-8", newline="") as handle:
                rows = list(csv.DictReader(handle))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["objects"], "케이크 | 커피")
        for column in report.LABEL_COLUMNS:
            self.assertEqual(rows[0][column], "")

    def test_failed_row_still_appears_for_review(self) -> None:
        with tempfile.TemporaryDirectory() as work_dir:
            path = str(Path(work_dir) / "labels.csv")
            report.write_label_sheet([_row("m1", status="failed", errorCode="TIMEOUT")], path)
            content = Path(path).read_text(encoding="utf-8")
        self.assertIn("TIMEOUT", content)


class ScoreLabelsTest(unittest.TestCase):
    def _labeled(self, **overrides) -> dict:
        row = {
            "model": "m1",
            "status": "success",
            "summary_factual": "1",
            "objects_expected": "4",
            "objects_missed": "1",
            "actions_correct": "1",
            "hallucinated": "0",
            "usable_correct": "1",
        }
        row.update(overrides)
        return row

    def test_computes_quality_metrics(self) -> None:
        scored = report.score_labels([self._labeled(), self._labeled(hallucinated="1")])["m1"]
        self.assertEqual(scored["labeledRows"], 2)
        self.assertEqual(scored["summaryFactualRate"], 1.0)
        self.assertAlmostEqual(scored["objectCoverage"], 0.75)
        self.assertEqual(scored["hallucinationRate"], 0.5)

    def test_unlabeled_rows_are_skipped_not_counted_as_zero(self) -> None:
        # 덜 채점한 만큼 품질이 나쁜 것처럼 보이면 모델 비교가 왜곡된다.
        scored = report.score_labels(
            [self._labeled(), self._labeled(summary_factual="", hallucinated="")]
        )["m1"]
        self.assertEqual(scored["labeledRows"], 1)
        self.assertEqual(scored["summaryFactualRate"], 1.0)
        self.assertEqual(scored["hallucinationRate"], 0.0)

    def test_metric_is_none_without_any_label(self) -> None:
        scored = report.score_labels([self._labeled(usable_correct="")])["m1"]
        self.assertIsNone(scored["usableForEditAccuracy"])


if __name__ == "__main__":
    unittest.main()
