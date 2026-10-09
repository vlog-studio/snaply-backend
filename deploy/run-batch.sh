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

export SNAPLY_ENV_FILE="${SNAPLY_ENV_FILE:-/data/compose/.env}"
# 어느 서버의 compose 인가. 지금 배포 대상은 AWS 서버 하나이고 cron 이
# `COMPOSE_FILE=docker-compose.aws.yml` 을 준다(deploy/aws/render-cron.sh) — 기본값도 같은 파일로 둔다.
# compose 가 이 변수를 직접 읽는다.
export COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.aws.yml}"
# 이미지 태그는 배포가 기록해 둔 값을 쓴다 — 지금 돌고 있는 그 버전으로 배치를 돌려야
# 스키마와 코드가 어긋나지 않는다.
# 읽은 값은 내보내야 compose(자식 프로세스)가 본다 — `.` 만으로는 이 셸의 변수일 뿐이다.
if [ -f deploy/.current-images ]; then
  set -a
  # shellcheck disable=SC1091
  . deploy/.current-images
  set +a
fi

# `--env-file`: compose 파일의 `${…}` 치환은 서비스의 `env_file` 을 읽지 않는다 — 시크릿 파일을 직접 넘긴다.
# `-w apps/api` 를 붙이지 않는다: 이미지의 작업 디렉터리가 이미 /app/apps/api 라, 붙이면 npm 이
# 그 아래에서 워크스페이스를 찾다가 `No workspaces found` 로 배치가 하나도 돌지 않는다.
exec docker compose --env-file "$SNAPLY_ENV_FILE" run --rm --no-deps api npm run "$BATCH" -- --yes
