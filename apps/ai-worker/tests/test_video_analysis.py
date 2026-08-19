"""스냅 내용 분석 파이프라인의 순수 로직 테스트.

ffmpeg 와 openai SDK 없이 돌아야 한다 — 프레임 시점 계산, 결과 검증, 오류 분류처럼
"조용히 틀리면 결과가 오염되는" 계산을 외부 호출과 분리해 여기서 잡는다.

    cd apps/ai-worker && python -m unittest tests.test_video_analysis
"""

import json
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
# 워커 런타임 의존성 없이 계산 로직만 검증한다 (test_editor.py 와 같은 방식).
sys.modules.setdefault("loguru", mock.MagicMock())

from pipeline.video_analysis import analyzer, frame_sampler, openai_client  # noqa: E402
from pipeline.video_analysis.errors import AnalysisError, classify_failure, is_retryable  # noqa: E402
from pipeline.video_analysis.schema import ResultSchemaError, validate_result  # noqa: E402


def _valid_payload() -> dict:
    return {
        "summary": "  카페 테이블 위의 디저트를 가까이서 촬영한 영상  ",
        "topics": ["카페", "디저트"],
        "places": ["카페"],
        "objects": ["케이크", "커피"],
        "actions": ["디저트를 가까이 보여줌"],
        "moods": ["차분한"],
        "visualQuality": {"score": 0.86, "issues": ["shaky"], "usableForEdit": True},
        "confidence": 0.91,
    }


def _response(body: str) -> dict:
    return {
        "id": "resp_1",
        "usage": {"input_tokens": 800, "output_tokens": 110},
        "output": [{"content": [{"type": "output_text", "text": body}]}],
    }


class FrameTimestampTest(unittest.TestCase):
    def test_three_second_video_matches_planned_positions(self) -> None:
        # 0.3 / 1.1 / 1.9 / 2.7 초.
        self.assertEqual(frame_sampler.frame_timestamps_ms(3000), [300, 1101, 1899, 2700])

    def test_first_and_last_frame_are_never_used(self) -> None:
        # 촬영 시작·종료의 흔들림을 피한다.
        timestamps = frame_sampler.frame_timestamps_ms(3000)
        self.assertTrue(all(0 < value < 3000 for value in timestamps))

    def test_very_short_video_collapses_near_duplicates(self) -> None:
        self.assertEqual(frame_sampler.frame_timestamps_ms(400), [40, 253])

    def test_zero_length_video_yields_no_timestamps(self) -> None:
        self.assertEqual(frame_sampler.frame_timestamps_ms(0), [])


class DurationParseTest(unittest.TestCase):
    def test_parses_ffprobe_json(self) -> None:
        self.assertEqual(
            frame_sampler.parse_duration_ms(json.dumps({"format": {"duration": "3.012000"}})),
            3012,
        )

    def test_rejects_non_positive_duration(self) -> None:
        with self.assertRaises(ValueError):
            frame_sampler.parse_duration_ms(json.dumps({"format": {"duration": "0"}}))


class ExtractCommandTest(unittest.TestCase):
    def setUp(self) -> None:
        self.frames = [(300, "/tmp/f0.jpg"), (1101, "/tmp/f1.jpg"), (1899, "/tmp/f2.jpg")]
        self.cmd = frame_sampler.build_extract_command("in.mp4", self.frames)

    def test_single_ffmpeg_invocation_with_one_input(self) -> None:
        self.assertEqual(self.cmd.count("-i"), 1)
        self.assertEqual(self.cmd[0], "ffmpeg")

    def test_every_frame_has_its_own_seek_and_output(self) -> None:
        self.assertEqual(self.cmd.count("-ss"), 3)
        self.assertEqual(self.cmd.count("-frames:v"), 3)
        self.assertEqual(self.cmd[self.cmd.index("-ss") + 1], "0.300")
        for _, path in self.frames:
            self.assertIn(path, self.cmd)

    def test_frames_are_downscaled(self) -> None:
        self.assertTrue(any("scale=" in part for part in self.cmd))

    def test_empty_frame_list_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            frame_sampler.build_extract_command("in.mp4", [])


class FrameDedupeTest(unittest.TestCase):
    def test_average_hash_sets_bits_above_mean(self) -> None:
        value = frame_sampler.ahash_from_gray_bytes(bytes([0] * 32 + [255] * 32))
        self.assertEqual(bin(value).count("1"), 32)

    def test_rejects_wrong_frame_size(self) -> None:
        with self.assertRaises(ValueError):
            frame_sampler.ahash_from_gray_bytes(b"\x00" * 10)

    def test_identical_frames_keep_only_one(self) -> None:
        # 거의 같은 화면만 반복되는 영상에 4장을 올리면 토큰만 쓰고 정보가 늘지 않는다.
        self.assertEqual(frame_sampler.dedupe_indices([7, 7, 7, 7]), [0])

    def test_distinct_frames_are_all_kept(self) -> None:
        self.assertEqual(
            frame_sampler.dedupe_indices([0, (1 << 40) - 1, 0xFFFFFFFFFFFFFFFF]), [0, 1, 2]
        )

    def test_near_duplicate_within_threshold_is_dropped(self) -> None:
        self.assertEqual(frame_sampler.dedupe_indices([0, 0b1111]), [0])


class RequestBuildTest(unittest.TestCase):
    def setUp(self) -> None:
        self.urls = ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"]
        self.request = openai_client.build_request(self.urls, model="m1", detail="low")

    def test_all_frames_go_in_one_request_in_order(self) -> None:
        content = self.request["input"][1]["content"]
        images = [item["image_url"] for item in content if item["type"] == "input_image"]
        self.assertEqual(images, self.urls)

    def test_every_image_uses_the_configured_detail(self) -> None:
        content = self.request["input"][1]["content"]
        details = {item["detail"] for item in content if item["type"] == "input_image"}
        self.assertEqual(details, {"low"})

    def test_structured_output_is_strict(self) -> None:
        fmt = self.request["text"]["format"]
        self.assertEqual(fmt["type"], "json_schema")
        self.assertTrue(fmt["strict"])
        self.assertFalse(fmt["schema"]["additionalProperties"])

    def test_no_audio_is_ever_sent(self) -> None:
        # 오디오는 이 파이프라인의 범위 밖이다 — 소리에 대한 판단을 하지 않는다.
        types = {
            item["type"] for message in self.request["input"] for item in message["content"]
        }
        self.assertEqual(types, {"input_text", "input_image"})

    def test_responses_are_not_stored_by_the_provider(self) -> None:
        # 기본값이 true 라서 명시하지 않으면 프레임이 30일간 제공자 쪽에 남는다.
        # 개인정보처리방침의 보유 기간 문장이 이 값에 걸려 있다.
        self.assertIs(self.request["store"], False)

    def test_request_without_images_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            openai_client.build_request([])


class FailureClassificationTest(unittest.TestCase):
    def test_retryable_failures(self) -> None:
        for status, name, expected in (
            (429, "RateLimitError", "RATE_LIMITED"),
            (503, "APIStatusError", "UPSTREAM_ERROR"),
            (None, "APITimeoutError", "TIMEOUT"),
            (None, "APIConnectionError", "NETWORK"),
        ):
            code, retryable = classify_failure(status, name, "")
            self.assertEqual(code, expected)
            self.assertTrue(retryable, expected)
            self.assertTrue(is_retryable(code), expected)

    def test_non_retryable_failures(self) -> None:
        for status, name, message, expected in (
            (401, "AuthenticationError", "", "AUTH_FAILED"),
            (400, "BadRequestError", "", "BAD_REQUEST"),
            (404, "NotFoundError", "", "MODEL_NOT_FOUND"),
            (400, "BadRequestError", "content_policy violation", "SAFETY_REFUSED"),
        ):
            code, retryable = classify_failure(status, name, message)
            self.assertEqual(code, expected)
            self.assertFalse(retryable, expected)
            self.assertFalse(is_retryable(code), expected)

    def test_frame_extraction_failure_is_terminal(self) -> None:
        # 손상된 영상은 다시 넣어도 같은 결과다 — API 의 재시도 안내와 같아야 한다.
        self.assertFalse(is_retryable("FRAME_EXTRACTION_FAILED"))


class ResponseReadTest(unittest.TestCase):
    def test_reads_output_text_and_usage(self) -> None:
        payload = _response('{"a":1}')
        self.assertEqual(openai_client.extract_output_text(payload), '{"a":1}')
        self.assertEqual(openai_client.read_usage(payload), (800, 110, "resp_1"))

    def test_empty_output_is_a_classified_failure(self) -> None:
        with self.assertRaises(AnalysisError) as caught:
            openai_client.extract_output_text({"output": []})
        self.assertEqual(caught.exception.code, "EMPTY_OUTPUT")

    def test_non_json_body_is_retryable_schema_failure(self) -> None:
        with self.assertRaises(AnalysisError) as caught:
            openai_client.parse_output_json("not json")
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


class AnalyzeOrchestrationTest(unittest.TestCase):
    """analyze() 는 ffmpeg·모델 호출을 감싸는 순서다. 스텁으로 순서와 오류 매핑만 본다."""

    def _patch(self, **overrides):
        defaults = {
            "probe_duration_ms": mock.Mock(return_value=3012),
            "extract_frames": mock.Mock(),
            "frame_ahash": mock.Mock(side_effect=[0, 0xFFFFFFFF00000000, 0xFFFFFFFF, 0xF0F0F0F0F0F0F0F0]),
        }
        defaults.update(overrides)
        return mock.patch.multiple(frame_sampler, **defaults)

    def setUp(self) -> None:
        # 추출된 프레임이 실제로 존재하는 것처럼 보이게 한다.
        self.exists = mock.patch("os.path.exists", return_value=True)
        self.exists.start()
        self.addCleanup(self.exists.stop)
        self.encode = mock.patch.object(
            openai_client, "encode_data_url", side_effect=lambda path: f"data:{path}"
        )
        self.encode.start()
        self.addCleanup(self.encode.stop)

    def test_happy_path_returns_measured_duration_and_tokens(self) -> None:
        call = mock.Mock(return_value=(_response(json.dumps(_valid_payload())), 1234))
        with self._patch(), mock.patch.object(openai_client, "call_vision", call):
            outcome = analyzer.analyze("/tmp/source.mp4", "/tmp/work")

        self.assertEqual(outcome.duration_ms, 3012)
        self.assertEqual(outcome.frame_timestamps_ms, [301, 1105, 1907, 2711])
        self.assertEqual((outcome.input_tokens, outcome.output_tokens), (800, 110))
        self.assertEqual(outcome.latency_ms, 1234)
        self.assertEqual(outcome.result["objects"], ["케이크", "커피"])
        # 프레임 4장이 한 요청에 들어갔다.
        request = call.call_args.args[0]
        images = [
            item for item in request["input"][1]["content"] if item["type"] == "input_image"
        ]
        self.assertEqual(len(images), 4)

    def test_unreadable_video_is_terminal_extraction_failure(self) -> None:
        probe = mock.Mock(side_effect=RuntimeError("moov atom not found"))
        with self._patch(probe_duration_ms=probe):
            with self.assertRaises(AnalysisError) as caught:
                analyzer.analyze("/tmp/source.mp4", "/tmp/work")
        self.assertEqual(caught.exception.code, "FRAME_EXTRACTION_FAILED")
        self.assertFalse(caught.exception.retryable)

    def test_ffmpeg_failure_is_terminal_extraction_failure(self) -> None:
        extract = mock.Mock(side_effect=frame_sampler.FrameExtractionError("ffmpeg 실패"))
        with self._patch(extract_frames=extract):
            with self.assertRaises(AnalysisError) as caught:
                analyzer.analyze("/tmp/source.mp4", "/tmp/work")
        self.assertEqual(caught.exception.code, "FRAME_EXTRACTION_FAILED")

    def test_out_of_contract_values_become_retryable_schema_error(self) -> None:
        broken = {**_valid_payload(), "confidence": 3.0}
        call = mock.Mock(return_value=(_response(json.dumps(broken)), 10))
        with self._patch(), mock.patch.object(openai_client, "call_vision", call):
            with self.assertRaises(AnalysisError) as caught:
                analyzer.analyze("/tmp/source.mp4", "/tmp/work")
        self.assertEqual(caught.exception.code, "SCHEMA_INVALID")
        self.assertTrue(caught.exception.retryable)

    def test_duplicate_frames_reduce_the_request_size(self) -> None:
        # 4장이 모두 같은 화면이면 1장만 올린다.
        same = mock.Mock(return_value=7)
        call = mock.Mock(return_value=(_response(json.dumps(_valid_payload())), 10))
        with self._patch(frame_ahash=same), mock.patch.object(openai_client, "call_vision", call):
            outcome = analyzer.analyze("/tmp/source.mp4", "/tmp/work")
        self.assertEqual(len(outcome.frame_timestamps_ms), 1)


if __name__ == "__main__":
    unittest.main()
