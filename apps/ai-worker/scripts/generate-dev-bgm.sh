#!/usr/bin/env bash
# 개발용 합성 BGM(placeholder) 생성. 실제 라이선스 음원이 아니며 파이프라인 검증용.
set -euo pipefail
cd "$(dirname "$0")/.."
BGM_DIR="assets/bgm"

gen() { # tag freq
  local dir="$BGM_DIR/$1"; mkdir -p "$dir"
  ffmpeg -y -f lavfi -i "sine=frequency=$2:duration=8" -c:a aac -b:a 96k \
    "$dir/dev_placeholder.m4a" >/dev/null 2>&1
  echo "generated $dir/dev_placeholder.m4a"
}

gen calm 220
gen upbeat 440
gen daily 330
echo "dev BGM placeholders 생성 완료 (라이선스 음원으로 교체 필요)"
