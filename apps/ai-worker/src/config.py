"""환경 변수 로딩 (apps/ai-worker/.env)."""

import os
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parent.parent


def _load_dotenv() -> None:
    env_path = WORKER_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


_load_dotenv()

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379")
DATABASE_URL = os.environ.get("DATABASE_URL", "")
EDIT_QUEUE_NAME = os.environ.get("EDIT_QUEUE_NAME", "edit-jobs")

# S3 / MinIO
S3_ENDPOINT = os.environ.get("S3_ENDPOINT") or None
S3_PUBLIC_ENDPOINT = (os.environ.get("S3_PUBLIC_ENDPOINT") or "").rstrip("/") or None
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "")
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID", "")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY", "")
AWS_REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
CLOUDFRONT_DOMAIN = (os.environ.get("CLOUDFRONT_DOMAIN") or "").rstrip("/") or None

# 편집 엔진
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
EDIT_TIMEOUT_SECONDS = int(os.environ.get("EDIT_TIMEOUT_SECONDS", "600"))
BGM_DIR = os.environ.get("BGM_DIR", "assets/bgm")


def edit_progress_channel(job_id: str) -> str:
    return f"edit-progress:{job_id}"


def public_url(s3_key: str) -> str:
    if CLOUDFRONT_DOMAIN:
        return f"{CLOUDFRONT_DOMAIN}/{s3_key}"
    if S3_PUBLIC_ENDPOINT:
        return f"{S3_PUBLIC_ENDPOINT}/{S3_BUCKET_NAME}/{s3_key}"
    if S3_ENDPOINT:
        return f"{S3_ENDPOINT.rstrip('/')}/{S3_BUCKET_NAME}/{s3_key}"
    return f"https://{S3_BUCKET_NAME}.s3.amazonaws.com/{s3_key}"
