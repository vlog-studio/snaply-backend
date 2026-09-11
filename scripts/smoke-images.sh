#!/usr/bin/env bash
#
# 빌드한 이미지가 실제로 뜨는지 확인한다 (backlog E-4).
#
# 왜 필요한가: 네이티브 실행으로는 재현되지 않는 결함이 실제로 두 번 나왔다 — Dockerfile 이
# `assets/`(BGM)를 복사하지 않은 것과, `BGM_DIR` 상대경로가 컨테이너 CWD 와 어긋난 것.
# 둘 다 테스트는 초록이었고 이미지만 깨져 있었다.
#
# 사용법:
#   scripts/smoke-images.sh                      # 로컬에서 빌드해서 검사
#   API_IMAGE=... WORKER_IMAGE=... SKIP_BUILD=1 scripts/smoke-images.sh   # CI: 이미 빌드된 것 검사
#
# 검사하는 것:
#   ① API 이미지가 떠서 /health 가 db=connected 를 돌려준다 (마이그레이션까지 포함)
#   ② 워커 이미지에 BGM 자산과 ffmpeg 이 있고 세 워커가 전부 임포트된다
set -euo pipefail

cd "$(dirname "$0")/.."

API_IMAGE="${API_IMAGE:-snaply-api:ci}"
WORKER_IMAGE="${WORKER_IMAGE:-snaply-ai-worker:ci}"
# 개발 스택(3000)·개인 로컬(3002)과 겹치지 않는 포트. 스모크는 잠깐 뜨고 사라진다.
API_HOST_PORT="${SMOKE_API_PORT:-3999}"
export API_IMAGE WORKER_IMAGE API_HOST_PORT

COMPOSE=(docker compose -p snaply-smoke -f docker-compose.yml -f docker-compose.ci.yml)

cleanup() {
  local status=$?
  if [ $status -ne 0 ]; then
    echo "::group::실패 시점의 컨테이너 로그"
    "${COMPOSE[@]}" logs --tail=120 || true
    echo "::endgroup::"
  fi
  "${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
  return $status
}
trap cleanup EXIT

if [ -z "${SKIP_BUILD:-}" ]; then
  echo "==> 이미지 빌드"
  docker build -f apps/api/Dockerfile -t "$API_IMAGE" .
  docker build -f apps/ai-worker/Dockerfile -t "$WORKER_IMAGE" .
fi

echo "==> ② 워커 이미지: 자산과 실행 파일"
# 파이썬 안에서 확인하는 이유: 경로를 여기에 다시 적으면 config.py 와 어긋나도 통과한다.
# 실제로 BGM_DIR 이 어긋났던 결함이 그렇게 숨었다.
docker run --rm --entrypoint python "$WORKER_IMAGE" -c '
import os, shutil, sys
sys.path.insert(0, "/app/src")
import config

problems = []
if not os.path.isdir(config.BGM_DIR):
    problems.append(f"BGM_DIR 이 이미지 안에 없다: {config.BGM_DIR}")
elif not os.listdir(config.BGM_DIR):
    # 지금은 README 뿐이라 비어 있지 않기만 확인한다 (음원 조달은 backlog).
    problems.append(f"BGM_DIR 이 비어 있다: {config.BGM_DIR}")
if shutil.which("ffmpeg") is None:
    problems.append("ffmpeg 이 없다")
if shutil.which("ffprobe") is None:
    problems.append("ffprobe 가 없다 — 렌디션이 길이를 실측하지 못한다")

for name in ("worker", "analysis_worker", "rendition_worker"):
    try:
        __import__(name)
    except Exception as err:  # noqa: BLE001 — 무엇이 깨졌는지 전부 보여준다
        problems.append(f"{name}.py 임포트 실패: {err!r}")

if problems:
    print("\n".join(f"  - {p}" for p in problems))
    sys.exit(1)
print("  워커 이미지 OK (BGM·ffmpeg·워커 3종)")
'

echo "==> ① API 이미지: 기동과 /health"
"${COMPOSE[@]}" up -d --no-build api

# db=connected 까지 기다린다. status:ok 만 보면 마이그레이션이 실패해도 통과한다 —
# 그 경우 API 는 뜨지만 어떤 요청도 처리하지 못한다.
body=""
for attempt in $(seq 1 30); do
  body=$(curl -fsS "http://127.0.0.1:${API_HOST_PORT}/health" 2>/dev/null || true)
  case "$body" in *'"db":"connected"'*) break ;; esac
  if [ "$attempt" -eq 30 ]; then
    echo "  /health 가 db=connected 를 돌려주지 않았다 (마지막 응답: ${body:-없음})"
    exit 1
  fi
  sleep 2
done
echo "  API 이미지 OK — $body"

echo "==> 스모크 통과"
