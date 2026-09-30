#!/usr/bin/env bash
# 로컬 개발 서버를 한 번에 올린다 — 원격 개발 환경 없이 이 Mac + 같은 Wi-Fi의 폰으로 개발할 때.
#
#   npm run dev:up
#
# 1. Docker Desktop이 꺼져 있으면 켜고 기다린다.
# 2. 개발 인프라(Postgres·MinIO·Redis, docker-compose.dev.yml)를 올리고 준비될 때까지 기다린다.
# 3. Prisma 클라이언트 생성 + 아직 적용 안 된 마이그레이션 적용(migrate deploy, 여러 번 돌려도 안전).
# 4. 무선 adb로 붙은 폰이 있으면 adb reverse(8081·3000·9100)를 다시 건다 — 앱이 127.0.0.1로
#    API·MinIO에 닿는 경로다. 폰이 없으면 경고만 하고 넘어간다.
# 5. API(npm run dev:api)를 이 터미널 포그라운드로 띄운다. Ctrl+C는 API만 멈추고 인프라
#    컨테이너는 남긴다(내리려면 npm run infra:down).
#
# 워커(편집·렌디션·분석·알림)는 띄우지 않는다 — 필요할 때 ONBOARDING §3-8.
set -euo pipefail

cd "$(dirname "$0")/.."

API_PORT=3000
MINIO_PORT=9100

step() { printf '\n==> %s\n' "$*"; }
die() { echo "error: $*" >&2; exit 1; }

[ -f apps/api/.env ] || die "apps/api/.env 가 없습니다 — ONBOARDING §3-3 에서 만듭니다"

# 1. Docker -------------------------------------------------------------------
if ! docker info >/dev/null 2>&1; then
  step "Docker Desktop 시작"
  [ -d /Applications/Docker.app ] || die "Docker 데몬이 꺼져 있고 Docker Desktop도 없습니다"
  open -a Docker
  for _ in $(seq 1 90); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  docker info >/dev/null 2>&1 || die "Docker Desktop이 3분 안에 준비되지 않았습니다"
fi

# 2. 인프라 --------------------------------------------------------------------
step "개발 인프라 기동 (Postgres · MinIO · Redis)"
npm run --silent infra:up

wait_for() {
  # $1 = 이름, 나머지 = 성공하면 준비된 것으로 보는 명령
  local name="$1"; shift
  for _ in $(seq 1 60); do
    "$@" >/dev/null 2>&1 && { echo "  $name 준비됨"; return 0; }
    sleep 1
  done
  die "$name 이(가) 60초 안에 준비되지 않았습니다 — npm run infra:logs 로 확인하세요"
}
wait_for Postgres docker exec snaply-postgres-dev pg_isready -U postgres
wait_for Redis docker exec snaply-redis-dev redis-cli ping
wait_for MinIO curl -sf "http://127.0.0.1:$MINIO_PORT/minio/health/live"

# 3. DB -----------------------------------------------------------------------
step "Prisma 클라이언트 생성 + 마이그레이션 적용"
npm run --silent db:generate >/dev/null
npm run --silent db:migrate

# 4. 폰 -----------------------------------------------------------------------
step "폰 adb reverse"
if ! bash apps/mobile/scripts/install-android-device.sh --reverse-only; then
  echo "  (폰 없이 계속합니다. 폰을 붙인 뒤: npm run android:device:reverse -w snaply-app)"
fi

# 5. API ----------------------------------------------------------------------
if curl -sf --max-time 2 "http://127.0.0.1:$API_PORT/health" >/dev/null; then
  step "API가 이미 :$API_PORT 에서 떠 있습니다 — 새로 띄우지 않습니다"
  exit 0
fi
if lsof -nP -iTCP:"$API_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  die ":$API_PORT 를 다른 프로세스가 쓰고 있습니다: $(lsof -nP -iTCP:"$API_PORT" -sTCP:LISTEN | awk 'NR==2 {print $1, "pid", $2}')"
fi

step "API 기동 (http://127.0.0.1:$API_PORT, Ctrl+C로 종료)"
exec npm run dev:api
