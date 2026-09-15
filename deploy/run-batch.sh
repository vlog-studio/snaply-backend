#!/usr/bin/env bash
#
# 배치 한 건을 배포된 API 이미지 안에서 실행한다 (cron 이 부른다).
#
#   deploy/run-batch.sh media:notify-expiring
#
# **dry-run 이 기본이므로 `--yes` 를 붙여 준다.** 붙이지 않으면 대상만 세고 아무것도 하지
# 않는다 — 배치가 "도는 것처럼 보이는데 아무 일도 안 하는" 상태가 제일 나쁘다.
#
# 새 컨테이너를 띄워 실행하고(`run --rm`) 끝나면 지운다. 상주 컨테이너에 `exec` 하지 않는
# 이유는, 배포 중 컨테이너가 교체되는 순간에 배치가 함께 죽지 않게 하기 위해서다.
set -euo pipefail

BATCH="${1:?실행할 배치 이름 (예: media:purge-expired)}"
cd "$(dirname "$0")/.."

export SNAPLY_ENV_FILE="${SNAPLY_ENV_FILE:-/etc/snaply/snaply.env}"
# 이미지 태그는 배포가 기록해 둔 값을 쓴다 — 지금 돌고 있는 그 버전으로 배치를 돌려야
# 스키마와 코드가 어긋나지 않는다.
if [ -f deploy/.current-images ]; then
  # shellcheck disable=SC1091
  . deploy/.current-images
fi

exec docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  run --rm --no-deps api npm run "$BATCH" -w apps/api -- --yes
