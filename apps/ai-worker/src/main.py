"""Snaply AI 편집 워커 — FastAPI 엔트리포인트 (Phase 1 뼈대)."""

import os
import time

from fastapi import FastAPI
from loguru import logger

app = FastAPI(title="snaply-ai-worker")

_started_at = time.monotonic()


@app.get("/health")
def health() -> dict:
    return {
        "success": True,
        "data": {
            "status": "ok",
            "uptimeSeconds": int(time.monotonic() - _started_at),
        },
    }


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("AI_WORKER_PORT", "8000"))
    logger.info("starting ai-worker on port {}", port)
    uvicorn.run("main:app", host="0.0.0.0", port=port)
