FROM python:3.11-slim

# FFmpeg는 Phase 5 편집 파이프라인에서 필요
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src/ ./src/
COPY assets/ ./assets/

WORKDIR /app/src

CMD ["python", "worker.py"]
