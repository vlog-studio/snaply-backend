# syntax=docker/dockerfile:1
# MinIO 커뮤니티 에디션을 소스에서 빌드한다 — 배포처가 모두 사라졌기 때문이다.
# Docker Hub `minio/minio` 는 2026-09-11 삭제, quay.io `minio/minio` 는 2026-09-25 부터 401,
# 공식 Dockerfile.release 는 dl.min.io 에서 바이너리를 받으므로 그것도 기댈 수 없다.
# 아카이브된 github.com/minio/minio 의 릴리스 태그를 커밋 SHA 까지 고정해 빌드하고
# .github/workflows/minio-image.yml 이 GHCR 로 올린다. 대체 여부는 backlog E-7.
#
# 런타임에 curl 을 둔다: docker-compose.yml 의 헬스체크가 컨테이너 안에서 curl 을 부른다.

# MINIO_RELEASE 라는 이름은 쓰지 않는다 — gen-ldflags.go 가 그 환경변수를 버전 접두사로 읽는다(아래).
ARG MINIO_TAG=RELEASE.2025-09-07T16-13-09Z
# 태그가 옮겨져도 같은 소스를 빌드하도록 커밋까지 확인한다.
ARG MINIO_COMMIT=07c3a429bfed433e49018cb0f78a52145d4bedeb

# 빌드 단계는 러너의 아키텍처에서 돌고 Go 가 대상 아키텍처로 크로스 컴파일한다 —
# arm64 를 QEMU 로 컴파일하면 수십 분이 걸린다.
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS build
ARG MINIO_TAG
ARG MINIO_COMMIT
ARG TARGETOS
ARG TARGETARCH
ENV CGO_ENABLED=0
RUN apk add --no-cache git
WORKDIR /src
RUN git clone --depth 1 --branch "$MINIO_TAG" https://github.com/minio/minio.git . \
    && test "$(git rev-parse HEAD)" = "$MINIO_COMMIT"
# 업스트림 Makefile 의 `build` 타깃과 같은 플래그. MINIO_RELEASE=RELEASE 는 업스트림 릴리스
# 빌드가 주던 값이다 — 없으면 버전이 DEVELOPMENT.<시각> 으로 찍힌다.
RUN GOOS="$TARGETOS" GOARCH="$TARGETARCH" go build -tags kqueue -trimpath \
      -ldflags "$(MINIO_RELEASE=RELEASE go run buildscripts/gen-ldflags.go)" \
      -o /out/minio

FROM alpine:3.22
ARG MINIO_TAG
LABEL org.opencontainers.image.source="https://github.com/vlog-studio/snaply-backend" \
      org.opencontainers.image.description="MinIO ${MINIO_TAG} built from the archived upstream source" \
      org.opencontainers.image.version="${MINIO_TAG}" \
      org.opencontainers.image.licenses="AGPL-3.0-only"
RUN apk add --no-cache ca-certificates curl
COPY --from=build /out/minio /usr/bin/minio
COPY --from=build /src/dockerscripts/docker-entrypoint.sh /usr/bin/docker-entrypoint.sh
COPY --from=build /src/LICENSE /src/CREDITS /licenses/
RUN chmod +x /usr/bin/docker-entrypoint.sh
EXPOSE 9000
VOLUME ["/data"]
ENTRYPOINT ["/usr/bin/docker-entrypoint.sh"]
CMD ["minio"]
