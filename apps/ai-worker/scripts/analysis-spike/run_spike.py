#!/usr/bin/env python3
"""스냅 내용 분석 스파이크 실행기.

목적은 기능 구현이 아니라 **기준선 확보**다 — 품질·스냅당 처리시간·토큰·단가·실패율.
결정과 범위: docs/decisions/snap-content-analysis.md

스키마·API·큐는 만들지 않는다. 이 스크립트는 로컬 파일만 읽고 쓴다.

    python run_spike.py --videos ./samples --models gpt-5.6-luna,gpt-5.6-terra
"""

import argparse
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path

from loguru import logger

sys.path.insert(0, str(Path(__file__).resolve().parent))

import frame_sampler  # noqa: E402
import report  # noqa: E402
import vision_client  # noqa: E402
from prompt import PROMPT_VERSION  # noqa: E402
from result_schema import ResultSchemaError, validate_result  # noqa: E402

VIDEO_SUFFIXES = (".mp4", ".mov", ".m4v")


def _load_models(models_arg: str, pricing_path: Path | None) -> list[dict]:
    """비교할 모델과 단가. 단가는 운영자가 채우며 비어 있으면 비용은 집계하지 않는다."""
    pricing: dict[str, dict] = {}
    if pricing_path and pricing_path.exists():
        pricing = {entry["id"]: entry for entry in json.loads(pricing_path.read_text())["models"]}
    models = []
    for model_id in [item.strip() for item in models_arg.split(",") if item.strip()]:
        entry = pricing.get(model_id, {})
        models.append(
            {
                "id": model_id,
                "priceInputPerMTok": entry.get("priceInputPerMTok"),
                "priceOutputPerMTok": entry.get("priceOutputPerMTok"),
            }
        )
        if entry.get("priceInputPerMTok") is None:
            logger.warning("{} 단가가 없어 비용 집계에서 제외된다 (models.json 을 채운다)", model_id)
    if not models:
        raise SystemExit("--models 가 비어 있습니다.")
    return models


def _prepare_frames(video: Path, work_dir: str, max_frames: int) -> tuple[int, list[int], list[str]]:
    """(실측 길이, 사용한 시점, 프레임 경로) — 유사 프레임 제거까지 끝낸 결과."""
    duration_ms = frame_sampler.probe_duration_ms(str(video))
    timestamps = frame_sampler.frame_timestamps_ms(duration_ms)[:max_frames]
    if not timestamps:
        raise frame_sampler.FrameExtractionError(f"프레임 시점을 계산할 수 없습니다: {video.name}")

    frames = [
        (timestamp, os.path.join(work_dir, f"frame_{index}.jpg"))
        for index, timestamp in enumerate(timestamps)
    ]
    frame_sampler.extract_frames(str(video), frames)
    existing = [(ts, path) for ts, path in frames if os.path.exists(path)]
    if not existing:
        raise frame_sampler.FrameExtractionError(f"프레임을 얻지 못했습니다: {video.name}")

    hashes = [frame_sampler.frame_ahash(path) for _, path in existing]
    kept = frame_sampler.dedupe_indices(hashes)
    return (
        duration_ms,
        [existing[index][0] for index in kept],
        [existing[index][1] for index in kept],
    )


def _analyze(video: Path, model: dict, frame_paths: list[str], args) -> dict:
    """한 영상 × 한 모델. 실패도 행으로 남긴다 — 실패율이 산출물이다."""
    data_urls = [vision_client.encode_data_url(path) for path in frame_paths]
    request = vision_client.build_request(
        model["id"],
        data_urls,
        detail=args.detail,
        reasoning_effort=args.reasoning_effort or None,
    )
    payload, latency_ms = vision_client.call_vision(request, timeout_seconds=args.timeout)
    input_tokens, output_tokens, request_id = vision_client.read_usage(payload)
    text = vision_client.extract_output_text(payload)
    result = validate_result(vision_client.parse_output_json(text))
    return {
        "status": "success",
        "errorCode": None,
        "retryable": None,
        "latencyMs": latency_ms,
        "inputTokens": input_tokens,
        "outputTokens": output_tokens,
        "requestId": request_id,
        "costUsd": vision_client.compute_cost_usd(
            input_tokens,
            output_tokens,
            model["priceInputPerMTok"],
            model["priceOutputPerMTok"],
        ),
        "result": result,
    }


def _failure(code: str, retryable: bool, message: str) -> dict:
    return {
        "status": "failed",
        "errorCode": code,
        "retryable": retryable,
        "errorMessage": message[:300],
        "latencyMs": None,
        "inputTokens": None,
        "outputTokens": None,
        "requestId": None,
        "costUsd": None,
        "result": None,
    }


def run(args) -> int:
    videos = sorted(
        path
        for path in Path(args.videos).iterdir()
        if path.suffix.lower() in VIDEO_SUFFIXES
    )[: args.max_videos]
    if not videos:
        raise SystemExit(f"{args.videos} 에 분석할 영상이 없습니다.")

    models = _load_models(args.models, Path(args.pricing) if args.pricing else None)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []

    logger.info(
        "스파이크 시작 videos={} models={} detail={} prompt={}",
        len(videos), [model["id"] for model in models], args.detail, PROMPT_VERSION,
    )

    for video in videos:
        work_dir = tempfile.mkdtemp(prefix="spike_frames_")
        try:
            duration_ms, timestamps, frame_paths = _prepare_frames(
                video, work_dir, args.max_frames
            )
            logger.info(
                "{} duration={}ms frames={} ({})",
                video.name, duration_ms, len(frame_paths), timestamps,
            )
            base = {
                "video": video.name,
                "promptVersion": PROMPT_VERSION,
                "detail": args.detail,
                "durationMs": duration_ms,
                "frameTimestampsMs": timestamps,
                "frameCount": len(frame_paths),
            }
            for model in models:
                if args.dry_run:
                    logger.info("dry-run — {} 호출 생략", model["id"])
                    continue
                try:
                    outcome = _analyze(video, model, frame_paths, args)
                    logger.info(
                        "{} × {} ok {}ms in={} out={}",
                        video.name, model["id"], outcome["latencyMs"],
                        outcome["inputTokens"], outcome["outputTokens"],
                    )
                except vision_client.VisionCallError as exc:
                    logger.error("{} × {} 실패 {}", video.name, model["id"], exc.code)
                    outcome = _failure(exc.code, exc.retryable, str(exc))
                except ResultSchemaError as exc:
                    logger.error("{} × {} 스키마 불일치 {}", video.name, model["id"], exc)
                    outcome = _failure("SCHEMA_INVALID", True, str(exc))
                rows.append({**base, "model": model["id"], **outcome})
        except Exception as exc:  # noqa: BLE001 — 한 영상의 실패로 실행 전체를 멈추지 않는다
            logger.error("{} 전처리 실패: {}", video.name, exc)
            for model in models:
                rows.append(
                    {
                        "video": video.name,
                        "model": model["id"],
                        "promptVersion": PROMPT_VERSION,
                        "detail": args.detail,
                        "durationMs": None,
                        "frameTimestampsMs": [],
                        "frameCount": 0,
                        **_failure("FRAME_EXTRACTION_FAILED", False, str(exc)),
                    }
                )
        finally:
            # 프레임은 영구 저장하지 않는다 — 성공·실패 모두 지운다.
            shutil.rmtree(work_dir, ignore_errors=True)

    if not rows:
        logger.warning("기록할 행이 없다 (dry-run 이었나?)")
        return 0

    results_path = out_dir / "results.jsonl"
    with results_path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")

    summary = report.aggregate(rows)
    (out_dir / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    report.write_label_sheet(rows, str(out_dir / "labels.csv"))

    for model_id, stats in summary.items():
        logger.info(
            "[{}] 성공 {}/{} p50={}ms p95={}ms in={} out={} 단가={} usable={}",
            model_id, stats["success"], stats["total"],
            stats["latencyP50Ms"], stats["latencyP95Ms"],
            stats["meanInputTokens"], stats["meanOutputTokens"],
            stats["meanCostUsdPerSnap"], stats["usableForEditTrueRate"],
        )
    logger.info("결과: {} · {} · {}", results_path, out_dir / "summary.json", out_dir / "labels.csv")
    logger.info("품질 지표는 labels.csv 를 채운 뒤 score_spike.py 로 낸다")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="스냅 내용 분석 스파이크")
    parser.add_argument("--videos", required=True, help="평가용 영상 디렉터리")
    parser.add_argument("--models", required=True, help="비교할 모델 id, 콤마 구분")
    parser.add_argument("--out", default="./out", help="리포트 출력 디렉터리")
    parser.add_argument("--pricing", default=str(Path(__file__).parent / "models.json"))
    parser.add_argument("--detail", default=vision_client.DEFAULT_DETAIL, choices=["low", "high"])
    parser.add_argument("--max-frames", type=int, default=4)
    parser.add_argument("--max-videos", type=int, default=100)
    parser.add_argument("--timeout", type=int, default=vision_client.DEFAULT_TIMEOUT_SECONDS)
    parser.add_argument(
        "--reasoning-effort",
        default="none",
        help="추론 파라미터를 지원하지 않는 모델은 빈 문자열로 끈다",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="프레임 추출까지만 하고 모델을 호출하지 않는다 (비용 0)",
    )
    args = parser.parse_args()
    if not args.dry_run and not os.environ.get("OPENAI_API_KEY"):
        raise SystemExit(
            "OPENAI_API_KEY 가 셸 환경에 없습니다. "
            "스파이크는 .env 를 쓰지 않는다 (decisions/snap-content-analysis.md §5.2)."
        )
    return run(args)


if __name__ == "__main__":
    raise SystemExit(main())
