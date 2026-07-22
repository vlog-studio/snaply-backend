"""환경 변수 로딩 (apps/ai-worker/.env)."""

import os
from pathlib import Path


def _load_dotenv() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_dotenv()

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
EDIT_QUEUE_NAME = os.environ.get("EDIT_QUEUE_NAME", "edit-jobs")


def edit_progress_channel(job_id: str) -> str:
    return f"edit-progress:{job_id}"
