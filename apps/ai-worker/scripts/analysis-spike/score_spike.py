#!/usr/bin/env python3
"""채점된 labels.csv → 모델별 품질 지표.

품질(요약 사실성·핵심 사물 포함률·환각 비율·usableForEdit 정확도)은 사람이 채점해야
얻어진다. 이 스크립트는 채점 결과를 집계할 뿐이며, 빈 칸은 세지 않는다.

    python score_spike.py --labels ./out/labels.csv
"""

import argparse
import csv
import json
from pathlib import Path

from loguru import logger

import report


def main() -> int:
    parser = argparse.ArgumentParser(description="스파이크 라벨 채점 집계")
    parser.add_argument("--labels", required=True, help="사람이 채운 labels.csv")
    parser.add_argument("--out", default=None, help="결과 JSON 경로 (기본: labels 옆 quality.json)")
    args = parser.parse_args()

    labels_path = Path(args.labels)
    with labels_path.open(encoding="utf-8", newline="") as handle:
        rows = [row for row in csv.DictReader(handle) if row.get("status") == "success"]
    if not rows:
        raise SystemExit(f"{labels_path} 에 채점할 성공 행이 없습니다.")

    scored = report.score_labels(rows)
    out_path = Path(args.out) if args.out else labels_path.parent / "quality.json"
    out_path.write_text(json.dumps(scored, ensure_ascii=False, indent=2), encoding="utf-8")

    for model_id, stats in scored.items():
        logger.info(
            "[{}] 채점 {}건 · 사실성 {} · 사물 포함률 {} · 행동 정확 {} · 환각 {} · usable 정확도 {}",
            model_id, stats["labeledRows"], stats["summaryFactualRate"],
            stats["objectCoverage"], stats["actionCorrectRate"],
            stats["hallucinationRate"], stats["usableForEditAccuracy"],
        )
    logger.info("결과: {}", out_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
