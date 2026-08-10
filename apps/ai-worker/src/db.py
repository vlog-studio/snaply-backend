"""asyncpg 기반 edit_jobs / videos 상태 업데이트."""

from datetime import datetime, timezone

import asyncpg
from loguru import logger

from config import DATABASE_URL

_pool: asyncpg.Pool | None = None


async def init_pool() -> None:
    global _pool
    if _pool is None:
        # Supabase session pooler(DIRECT_URL) 사용. statement_cache_size=0 은
        # 풀러 환경에서 prepared statement 충돌을 피하기 위함.
        _pool = await asyncpg.create_pool(
            DATABASE_URL, min_size=1, max_size=4, statement_cache_size=0
        )
        logger.info("asyncpg 풀 생성 완료")


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None


def _pool_or_raise() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("DB 풀이 초기화되지 않았습니다. init_pool()을 먼저 호출하세요.")
    return _pool


async def fetch_job_context(job_id: str) -> dict | None:
    """edit_jobs에서 결과물 video_id, user_id 조회."""
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT user_id, video_id FROM edit_jobs WHERE id=$1", job_id
        )
        if not row:
            return None
        return {"user_id": str(row["user_id"]), "video_id": str(row["video_id"])}


async def fetch_source_keys(user_id: str, video_ids: list[str]) -> dict[str, str]:
    """Return owned, ready source keys keyed by video id."""
    async with _pool_or_raise().acquire() as conn:
        rows = await conn.fetch(
            "SELECT id, s3_key FROM videos "
            "WHERE id = ANY($1::uuid[]) AND user_id=$2 AND kind='source' "
            "AND status='ready' AND deleted_at IS NULL",
            video_ids,
            user_id,
        )
    return {str(row["id"]): row["s3_key"] for row in rows if row["s3_key"]}


async def set_video_result(
    video_id: str,
    edited_url: str,
    edited_s3_key: str,
    thumbnail_url: str,
    thumbnail_s3_key: str,
) -> None:
    async with _pool_or_raise().acquire() as conn:
        await conn.execute(
            "UPDATE videos SET edited_url=$2, edited_s3_key=$3, "
            "thumbnail_url=$4, thumbnail_s3_key=$5, status='done' WHERE id=$1",
            video_id,
            edited_url,
            edited_s3_key,
            thumbnail_url,
            thumbnail_s3_key,
        )


async def mark_processing(job_id: str) -> None:
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        await conn.execute(
            "UPDATE edit_jobs SET status='processing', started_at=$2, progress=0 WHERE id=$1",
            job_id,
            now,
        )


async def update_progress(job_id: str, progress: int) -> None:
    async with _pool_or_raise().acquire() as conn:
        await conn.execute(
            "UPDATE edit_jobs SET progress=$2 WHERE id=$1", job_id, progress
        )


async def mark_done(job_id: str) -> None:
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='done', progress=100, completed_at=$2 "
            "WHERE id=$1 RETURNING video_id",
            job_id,
            now,
        )
        if row and row["video_id"]:
            await conn.execute(
                "UPDATE videos SET status='done' WHERE id=$1", row["video_id"]
            )


async def mark_failed(job_id: str, error_message: str) -> None:
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='failed', error_message=$2, completed_at=$3 "
            "WHERE id=$1 RETURNING video_id",
            job_id,
            error_message[:1000],
            now,
        )
        if row and row["video_id"]:
            await conn.execute(
                "UPDATE videos SET status='failed' WHERE id=$1", row["video_id"]
            )
