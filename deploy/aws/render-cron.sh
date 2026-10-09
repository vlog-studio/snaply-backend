#!/usr/bin/env bash
#
# deploy/batches.cron 을 AWS 서버용으로 바꿔 표준 출력으로 낸다 — install.sh 가 /etc/cron.d/snaply 로 깐다.
#
# 배치 시각과 순서의 원천은 batches.cron 하나다. 서버마다 사본을 두면 한쪽만 고쳐져 예고 없이 정리만 도는
# 서버가 생길 수 있다(예고와 정리의 시각 규칙은 docs/deployment-aws.md §4). 여기서는 경로와 compose 파일만 바꾼다.
set -euo pipefail

src="$(dirname "$0")/../batches.cron"

out="$(awk '
  /^SNAPLY_DIR=/ {
    print "SNAPLY_DIR=/data/compose"
    print "# AWS 서버: 단독 compose · Secrets Manager 에서 옮긴 env 파일 · 매일 스냅샷되는 /data 의 백업 폴더"
    print "COMPOSE_FILE=docker-compose.aws.yml"
    print "SNAPLY_ENV_FILE=/data/compose/.env"
    print "SNAPLY_BACKUP_DIR=/data/backup"
    replaced = 1
    next
  }
  { print }
  END { if (!replaced) exit 1 }
' "$src")" || {
  echo "batches.cron 에서 SNAPLY_DIR= 줄을 찾지 못했다 — 형식이 바뀌었으면 이 스크립트도 고친다" >&2
  exit 1
}

printf '%s\n' "$out"
