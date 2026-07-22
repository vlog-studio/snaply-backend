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
