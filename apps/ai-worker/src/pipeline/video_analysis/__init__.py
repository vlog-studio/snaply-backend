"""스냅 내용 분석 파이프라인.

편집 파이프라인과 분리한 이유: 분석에는 Whisper 가 필요 없고, 모델 호출 동시성과 FFmpeg
편집 동시성을 따로 조절해야 한다. 같은 이미지를 쓰되 실행 커맨드만 다르다
(docs/decisions/snap-content-analysis.md).
"""
