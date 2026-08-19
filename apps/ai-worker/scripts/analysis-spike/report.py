"""실행 결과 집계와 라벨링 시트 생성 — 표준 라이브러리만 쓴다.

집계 로직을 CLI 에서 분리한 이유는 테스트다. 기준선 숫자를 내는 코드가 틀리면
스파이크의 결론 전체가 틀린다.
"""

import csv
from collections import Counter

# 사람이 채우는 열. run_spike 가 앞쪽 열을 채워 내보내고, 이 열들은 비워 둔다.
LABEL_COLUMNS = (
    "summary_factual",     # 요약이 사실인가 1/0
    "objects_expected",    # 이 영상의 핵심 사물 수 (사람이 센다)
    "objects_missed",      # 그중 모델이 놓친 수
    "actions_correct",     # 주요 행동을 맞혔는가 1/0
    "hallucinated",        # 없는 내용을 만들었는가 1/0
    "usable_correct",      # usableForEdit 판단이 맞는가 1/0
    "note",
)

MODEL_OUTPUT_COLUMNS = (
    "video", "model", "status", "error_code", "frame_count",
    "duration_ms", "latency_ms", "input_tokens", "output_tokens", "cost_usd",
    "summary", "topics", "places", "objects", "actions", "moods",
    "quality_score", "visual_issues", "usable_for_edit", "confidence",
)


def percentile(values: list[float], fraction: float) -> float | None:
    """가장 가까운 순위 방식. 표본이 30~100개라 보간까지 갈 이유가 없다."""
    if not values:
        return None
    ordered = sorted(values)
    index = min(len(ordered) - 1, max(0, round(fraction * (len(ordered) - 1))))
    return ordered[index]


def _mean(values: list[float]) -> float | None:
    return sum(values) / len(values) if values else None


def aggregate(rows: list[dict]) -> dict:
    """모델별 기준선. 비용은 단가가 채워진 행만으로 계산한다."""
    summary: dict[str, dict] = {}
    for model in dict.fromkeys(row["model"] for row in rows):
        model_rows = [row for row in rows if row["model"] == model]
        done = [row for row in model_rows if row["status"] == "success"]
        latencies = [row["latencyMs"] for row in done if row.get("latencyMs") is not None]
        costs = [row["costUsd"] for row in done if row.get("costUsd") is not None]
        usable = [
            bool(row["result"]["visualQuality"]["usableForEdit"])
            for row in done
            if row.get("result")
        ]
        summary[model] = {
            "total": len(model_rows),
            "success": len(done),
            "successRate": len(done) / len(model_rows) if model_rows else None,
            "latencyP50Ms": percentile(latencies, 0.50),
            "latencyP95Ms": percentile(latencies, 0.95),
            "meanInputTokens": _mean([row["inputTokens"] or 0 for row in done]),
            "meanOutputTokens": _mean([row["outputTokens"] or 0 for row in done]),
            "meanFrameCount": _mean([row["frameCount"] for row in model_rows]),
            # 단가 미기재 모델은 None. 임의 값을 채워 결론을 만들지 않는다.
            "meanCostUsdPerSnap": _mean(costs),
            "costSampleSize": len(costs),
            "usableForEditTrueRate": _mean([1.0 if flag else 0.0 for flag in usable]),
            "errorCodes": dict(
                Counter(row["errorCode"] for row in model_rows if row["status"] != "success")
            ),
        }
    return summary


def _join(values: object) -> str:
    return " | ".join(values) if isinstance(values, list) else ""


def label_row(row: dict) -> dict:
    result = row.get("result") or {}
    quality = result.get("visualQuality") or {}
    return {
        "video": row["video"],
        "model": row["model"],
        "status": row["status"],
        "error_code": row.get("errorCode") or "",
        "frame_count": row.get("frameCount"),
        "duration_ms": row.get("durationMs"),
        "latency_ms": row.get("latencyMs"),
        "input_tokens": row.get("inputTokens"),
        "output_tokens": row.get("outputTokens"),
        "cost_usd": row.get("costUsd"),
        "summary": result.get("summary", ""),
        "topics": _join(result.get("topics")),
        "places": _join(result.get("places")),
        "objects": _join(result.get("objects")),
        "actions": _join(result.get("actions")),
        "moods": _join(result.get("moods")),
        "quality_score": quality.get("score"),
        "visual_issues": _join(quality.get("issues")),
        "usable_for_edit": quality.get("usableForEdit"),
        "confidence": result.get("confidence"),
        **{column: "" for column in LABEL_COLUMNS},
    }


def write_label_sheet(rows: list[dict], out_path: str) -> None:
    columns = list(MODEL_OUTPUT_COLUMNS) + list(LABEL_COLUMNS)
    with open(out_path, "w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow(label_row(row))


def score_labels(labeled_rows: list[dict]) -> dict:
    """사람이 채운 라벨 → 모델별 품질 지표.

    빈 칸은 채점하지 않은 행으로 보고 제외한다. 0 으로 세면 채점을 덜 한 만큼
    품질이 나쁜 것처럼 보인다.
    """
    scored: dict[str, dict] = {}
    for model in dict.fromkeys(row["model"] for row in labeled_rows):
        rows = [row for row in labeled_rows if row["model"] == model]

        def _flags(column: str) -> list[float]:
            values = []
            for row in rows:
                raw = (row.get(column) or "").strip()
                if raw in ("0", "1"):
                    values.append(float(raw))
            return values

        expected = sum(
            int(row["objects_expected"])
            for row in rows
            if (row.get("objects_expected") or "").strip().isdigit()
        )
        missed = sum(
            int(row["objects_missed"])
            for row in rows
            if (row.get("objects_missed") or "").strip().isdigit()
        )
        factual = _flags("summary_factual")
        actions = _flags("actions_correct")
        hallucinated = _flags("hallucinated")
        usable = _flags("usable_correct")
        scored[model] = {
            "labeledRows": len(factual),
            "summaryFactualRate": _mean(factual),
            "objectCoverage": (expected - missed) / expected if expected else None,
            "actionCorrectRate": _mean(actions),
            "hallucinationRate": _mean(hallucinated),
            "usableForEditAccuracy": _mean(usable),
        }
    return scored
