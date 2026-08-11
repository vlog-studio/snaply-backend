"""환경 변수 로딩.

로컬 개발용 .env 는 저장소에 하나만 둔다 — `apps/api/.env`. 워커가 자기 사본을 따로 갖고 있으면
DATABASE_URL/REDIS_URL/S3 값이 API 와 갈라져도 아무도 모른다.
`apps/ai-worker/.env` 가 있으면 그쪽을 우선하되, 없으면 API 쪽 파일을 읽는다.

운영에서는 두 파일 다 없고 값은 주입으로 들어온다. `setdefault` 라서 주입값이 항상 이긴다.
"""

import os
import re
from pathlib import Path

WORKER_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = WORKER_ROOT.parent.parent

ENV_CANDIDATES = (WORKER_ROOT / ".env", REPO_ROOT / "apps" / "api" / ".env")

# 따옴표 없는 값에서 주석이 시작되는 위치. 줄 맨 앞이거나 공백 뒤의 `#` 만 주석으로 본다
# (비밀번호에 들어간 `pa#ss` 같은 `#` 는 값의 일부다). Node 의 --env-file 과 같은 규칙.
_INLINE_COMMENT = re.compile(r"(?:^|\s)#")


def _parse_value(raw: str) -> str:
    value = raw.strip()
    quote = value[:1]
    if quote in ('"', "'"):
        end = value.find(quote, 1)
        if end > 0:
            # 닫는 따옴표 뒤는 주석이므로 버린다.
            return value[1:end]
    match = _INLINE_COMMENT.search(value)
    if match:
        value = value[: match.start()]
    return value.strip()


def _load_dotenv() -> None:
    env_path = next((path for path in ENV_CANDIDATES if path.exists()), None)
    if env_path is None:
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), _parse_value(value))


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
S3_DOWNLOAD_URL_EXPIRY_SECONDS = int(
    os.environ.get("S3_DOWNLOAD_URL_EXPIRY_SECONDS", "3600")
)

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
