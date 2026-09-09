"""ingest 렌디션 워커의 DB 접근.

렌디션은 **원본을 대체하지 않는다.** 원본 키(`s3_key`)는 그대로 두고 배포본 키만 채운다 —
편집은 계속 원본을 쓰고, 렌디션은 "어디서나 재생되는 사본"일 뿐이다.

상태 전이는 pending → processing → ready|failed 다. 실패해도 스냅 자체는 쓸 수 있으므로
`videos.status` 는 건드리지 않는다.
"""

from datetime import datetime, timezone

import db


async def fetch_context(video_id: str) -> dict | None:
    """변환 대상의 원본 키와 현재 상태. 삭제된 영상은 None."""
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id, s3_key, kind, status, rendition_status, deleted_at "
            "  FROM videos WHERE id=$1",
            video_id,
        )
    return dict(row) if row else None


async def mark_processing(video_id: str) -> bool:
    """processing 으로 전이. False 면 이미 끝났거나 사라진 것이라 다시 만들지 않는다."""
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE videos SET rendition_status='processing' "
            " WHERE id=$1 AND deleted_at IS NULL "
            "   AND rendition_status IN ('pending','processing','failed') RETURNING id",
            video_id,
        )
    return row is not None


async def save_rendition(
    video_id: str, rendition_key: str, thumbnail_key: str | None, duration_ms: int | None
) -> bool:
    """
    배포본을 반영한다. False 면 그 사이 영상이 삭제된 것 — 만들어 둔 객체는 정리 배치가 회수한다.

    썸네일은 이미 있으면 덮지 않는다: 편집 결과물의 썸네일과 컬럼을 공유하므로, 뒤늦게 끝난
    ingest 가 렌더 썸네일을 덮어쓰면 완성본 표지가 원본 프레임으로 바뀐다.
    """
    now = datetime.now(timezone.utc)
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE videos "
            "   SET rendition_s3_key=$2, rendition_status='ready', "
            "       duration_ms=COALESCE($4, duration_ms), "
            "       thumbnail_s3_key=COALESCE(thumbnail_s3_key, $3), "
            "       captured_at=captured_at "
            " WHERE id=$1 AND deleted_at IS NULL RETURNING id",
            video_id,
            rendition_key,
            thumbnail_key,
            duration_ms,
        )
    _ = now
    return row is not None


async def mark_failed(video_id: str) -> None:
    """
    변환 실패. **스냅 자체는 계속 쓸 수 있다** — 다른 플랫폼에서 재생이 안 될 뿐이고
    편집은 원본으로 돈다. 그래서 `videos.status` 는 건드리지 않는다.
    """
    async with db.pool().acquire() as conn:
        await conn.execute(
            "UPDATE videos SET rendition_status='failed' WHERE id=$1 AND deleted_at IS NULL",
            video_id,
        )
