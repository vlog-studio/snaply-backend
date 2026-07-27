# syntax=docker/dockerfile:1
FROM node:20-slim AS base
WORKDIR /app

# 모노레포 매니페스트 복사 후 설치 (레이어 캐시)
COPY package.json package-lock.json ./
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/api/package.json apps/api/
RUN npm ci

# 소스 복사
COPY tsconfig.base.json turbo.json ./
COPY packages/shared-types packages/shared-types
COPY apps/api apps/api

# Prisma 클라이언트 생성 + 빌드
RUN npx prisma generate --schema apps/api/prisma/schema.prisma \
    && npm run build

WORKDIR /app/apps/api
EXPOSE 3000
CMD ["node", "dist/index.js"]
