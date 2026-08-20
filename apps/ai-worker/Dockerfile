# 빌드 컨텍스트는 **저장소 루트**다 (apps/api/Dockerfile 과 같다).
# 워커가 packages/shared-types 의 앵커 사전을 읽어야 하는데, 컨텍스트가 apps/ai-worker 면
# 그 파일이 컨텍스트 밖이라 이미지에 들어갈 수가 없다 — docs/plans/edit-spec-v3-kickoff.md §3.1
#
# COPY 경로를 `. .` 로 넓히지 말 것. 문서 한 줄만 고쳐도 이미지가 통째로 재빌드된다.
FROM python:3.11-slim

# FFmpeg는 Phase 5 편집 파이프라인에서 필요
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY apps/ai-worker/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 공유 사전 — 원본은 packages/shared-types 하나이고 API 도 같은 파일을 읽는다.
# src/ 보다 앞에 둬서 워커 코드를 고칠 때 이 레이어가 깨지지 않게 한다.
# dist/ 가 아니라 src/ 를 가져가므로 이 이미지는 Node 빌드에 의존하지 않는다.
COPY packages/shared-types/src/*-vocabulary.json ./

COPY apps/ai-worker/src/ ./src/
# BGM 라이브러리 (실제 음원은 git 제외 — 없으면 워커가 BGM을 생략하고 진행)
COPY apps/ai-worker/assets/ ./assets/
ENV BGM_DIR=/app/assets/bgm

WORKDIR /app/src

CMD ["python", "worker.py"]
