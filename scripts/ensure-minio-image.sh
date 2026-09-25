#!/usr/bin/env bash
# MinIO 이미지를 로컬 데몬에 준비한다 — 받을 수 있으면 받고, 아니면 deploy/minio 에서 빌드한다.
#
# 이미지는 ghcr.io 에 우리가 올린 것이다(.github/workflows/minio-image.yml). 패키지가 비공개면
# `docker login ghcr.io` 없이 받을 수 없고, 워크플로가 올리기 전에도 없다. 어느 경우든 같은
# Dockerfile 로 같은 태그를 만들면 compose 는 그 로컬 이미지를 쓴다. 배경은 backlog E-7.
#
#   image=$(scripts/ensure-minio-image.sh)   # 이미지 이름은 docker-compose.dev.yml 에서 읽는다
#
# stdout 에는 이미지 이름만 쓴다. 진행 메시지와 빌드 로그는 stderr 로 간다.
set -euo pipefail

cd "$(dirname "$0")/.."

image=$(awk '/image: .*\/minio:/ { print $2; exit }' docker-compose.dev.yml)
if [ -z "$image" ]; then
  echo "docker-compose.dev.yml 에서 MinIO 이미지를 찾지 못했습니다" >&2
  exit 1
fi

if docker image inspect "$image" >/dev/null 2>&1; then
  echo "MinIO 이미지가 이미 있습니다: $image" >&2
  echo "$image"
  exit 0
fi

if docker pull "$image" >/dev/null 2>&1; then
  echo "MinIO 이미지를 받았습니다: $image" >&2
  echo "$image"
  exit 0
fi

echo "MinIO 이미지를 받을 수 없어 소스에서 빌드합니다(몇 분 걸립니다): $image" >&2
docker build -t "$image" deploy/minio >&2
echo "$image"
