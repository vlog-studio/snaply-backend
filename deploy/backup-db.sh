#!/usr/bin/env bash
#
# Postgres 덤프를 로컬에 남긴다. 관리형 DB 가 아니라 **이것이 유일한 안전망**이다.
#
# 영상 파일은 MinIO 에 따로 있지만, DB 가 날아가면 무엇이 누구의 것이고 어떤 무비가 어떤
# 스냅을 쓰는지를 전부 잃는다 — 파일만 남고 의미가 사라진다.
#
# 덤프는 같은 서버에 쌓인다. **서버가 통째로 죽는 경우는 이 백업으로 못 막는다** —
# 외부 보관은 별도 판단이 필요하다(backlog B-1).
set -euo pipefail

cd "$(dirname "$0")/.."
DEST="${SNAPLY_BACKUP_DIR:-/var/backups/snaply}"
KEEP_DAYS="${SNAPLY_BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DEST"

STAMP=$(date +%Y%m%d-%H%M%S)
OUT="$DEST/snaply-$STAMP.sql.gz"

docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U postgres -d snaply | gzip > "$OUT"

# 비어 있는 덤프를 성공으로 치지 않는다 — pg_dump 가 죽어도 gzip 은 0 을 돌려줄 수 있다.
if [ ! -s "$OUT" ] || [ "$(stat -c%s "$OUT")" -lt 1024 ]; then
  echo "덤프가 비었거나 너무 작다: $OUT" >&2
  exit 1
fi

find "$DEST" -name 'snaply-*.sql.gz' -mtime "+$KEEP_DAYS" -delete
echo "백업 완료: $OUT ($(stat -c%s "$OUT") bytes)"
