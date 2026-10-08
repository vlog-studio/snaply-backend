"""환경 변수 로딩.

로컬 개발용 .env 는 저장소에 하나만 둔다 — `apps/api/.env`. 워커가 자기 사본을 따로 갖고 있으면
DATABASE_URL/REDIS_URL/S3 값이 API 와 갈라져도 아무도 모른다.
`apps/ai-worker/.env` 는 사본이 아니라 워커만 다르게 써야 하는 줄을 두는 곳이다(asyncpg 가 pgbouncer
URL 을 못 쓸 때의 DATABASE_URL 한 줄). 두 파일을 모두 읽고, 같은 키는 워커 쪽이 이긴다 — 워커 파일만
읽으면 거기 없는 키(OPENAI_API_KEY·S3 등)가 통째로 사라진다.

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
    # 앞의 파일이 이긴다 — setdefault 라서 먼저 읽은 값이 남는다.
    for env_path in ENV_CANDIDATES:
        if not env_path.exists():
            continue
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
#: editSpec v3(경계별 전환) 전용 큐. 구버전 워커가 v3 를 v2 로 렌더하지 않게 나눈다(edit-spec-v3.md §4).
EDIT_V3_QUEUE_NAME = os.environ.get("EDIT_V3_QUEUE_NAME", "edit-v3")
RENDITION_QUEUE_NAME = os.environ.get("RENDITION_QUEUE_NAME", "renditions")
#: 알림 요청 큐. 워커가 넣고 Node 쪽 알림 워커가 꺼내 발송한다(notify.py 참고).
NOTIFICATION_QUEUE_NAME = os.environ.get("NOTIFICATION_QUEUE_NAME", "notifications")
# 배포 렌디션은 짧은 변환이라 편집보다 짧게 잡는다.
RENDITION_TIMEOUT_SECONDS = int(os.environ.get("RENDITION_TIMEOUT_SECONDS", "300"))
RENDITION_CONCURRENCY = int(os.environ.get("RENDITION_CONCURRENCY", "2"))

# S3 / MinIO
S3_ENDPOINT = os.environ.get("S3_ENDPOINT") or None
S3_PUBLIC_ENDPOINT = (os.environ.get("S3_PUBLIC_ENDPOINT") or "").rstrip("/") or None
S3_BUCKET_NAME = os.environ.get("S3_BUCKET_NAME", "")
# 키는 MinIO(S3_ENDPOINT)용이다. AWS 서버는 비워 두고 인스턴스 역할로 붙는다 — None 이어야 boto3 가
# 기본 체인(…→ 인스턴스 메타데이터)을 탄다. 빈 문자열을 넘기면 체인을 타지 않고 빈 키로 서명한다.
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID") or None
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY") or None
AWS_REGION = os.environ.get("AWS_REGION", "ap-northeast-2")
CLOUDFRONT_DOMAIN = (os.environ.get("CLOUDFRONT_DOMAIN") or "").rstrip("/") or None
S3_DOWNLOAD_URL_EXPIRY_SECONDS = int(
    os.environ.get("S3_DOWNLOAD_URL_EXPIRY_SECONDS", "3600")
)

# 편집 엔진
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
EDIT_TIMEOUT_SECONDS = int(os.environ.get("EDIT_TIMEOUT_SECONDS", "600"))
BGM_DIR = os.environ.get("BGM_DIR", "assets/bgm")

# 스냅 내용 분석 (analysis_worker.py 전용)
# 결과는 자동 편집 추천의 입력이다 — docs/decisions/snap-content-analysis.md
VIDEO_ANALYSIS_QUEUE_NAME = os.environ.get("VIDEO_ANALYSIS_QUEUE_NAME", "video-analysis")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")
OPENAI_VISION_MODEL = os.environ.get("OPENAI_VISION_MODEL", "gpt-5.6-luna")
OPENAI_IMAGE_DETAIL = os.environ.get("OPENAI_IMAGE_DETAIL", "low")
VIDEO_ANALYSIS_TIMEOUT_SECONDS = int(os.environ.get("VIDEO_ANALYSIS_TIMEOUT_SECONDS", "90"))
VIDEO_ANALYSIS_CONCURRENCY = int(os.environ.get("VIDEO_ANALYSIS_CONCURRENCY", "3"))
VIDEO_ANALYSIS_PROMPT_VERSION = os.environ.get("VIDEO_ANALYSIS_PROMPT_VERSION", "v1")


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
