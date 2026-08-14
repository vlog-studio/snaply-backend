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


async def mark_processing(job_id: str) -> bool:
    """queued/processing일 때만 processing으로 전이. False면 취소(또는 종료)된 작업."""
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='processing', started_at=$2, progress=0 "
            "WHERE id=$1 AND status IN ('queued','processing') RETURNING id",
            job_id,
            now,
        )
        return row is not None


async def update_progress(job_id: str, progress: int) -> bool:
    """processing일 때만 갱신. False면 그 사이 취소된 작업 — 파이프라인을 중단해야 한다."""
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET progress=$2 WHERE id=$1 AND status='processing' RETURNING id",
            job_id,
            progress,
        )
        return row is not None


async def mark_done(job_id: str) -> bool:
    """processing일 때만 done으로 확정. False면 취소된 작업이 done으로 되살아나는 것을 막은 것."""
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='done', progress=100, completed_at=$2 "
            "WHERE id=$1 AND status='processing' RETURNING video_id",
            job_id,
            now,
        )
        if row and row["video_id"]:
            await conn.execute(
                "UPDATE videos SET status='done' WHERE id=$1 AND deleted_at IS NULL",
                row["video_id"],
            )
        return row is not None


async def mark_failed(job_id: str, error_message: str, error_code: str = "INTERNAL") -> None:
    """진행 중 작업만 failed 처리. 이미 canceled/done이면 덮어쓰지 않는다.

    실패를 확정한 경우에만 예약 크레딧을 환급한다 — 실패의 최종 판정 주체가 워커이므로
    여기서 즉시 돌려주는 것이 사용자에게 정확하다.
    """
    now = datetime.now(timezone.utc)
    async with _pool_or_raise().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE edit_jobs SET status='failed', error_message=$2, error_code=$3, "
            "completed_at=$4 "
            "WHERE id=$1 AND status IN ('queued','processing') RETURNING video_id",
            job_id,
            error_message[:1000],
            error_code,
            now,
        )
        if row is None:
            return  # 이미 canceled/done — 상태도 크레딧도 건드리지 않는다
        if row["video_id"]:
            await conn.execute(
                "UPDATE videos SET status='failed' WHERE id=$1 AND deleted_at IS NULL",
                row["video_id"],
            )
        await _refund_export_credits(conn, job_id)


async def _refund_export_credits(conn, job_id: str) -> None:
    """실패한 export 의 예약 크레딧을 환급한다.

    금액을 인자로 받지 않고 원장에서 계산한다 — 실제로 차감된 만큼만 돌려주기 위해서다.
    `credit_ledger(edit_job_id, reason)` unique 제약이 멱등성을 보장하므로, API 취소 경로
    (apps/api/src/services/credit.service.ts `refundForExport`)와 겹쳐 실행돼도 환급은
    한 번만 기록된다. 두 경로가 같은 문장을 쓴다 — 한쪽만 고치지 말 것.
    """
    await conn.execute(
        """
        INSERT INTO credit_ledger (id, user_id, delta, reason, edit_job_id, created_at)
        SELECT gen_random_uuid(), user_id, -SUM(delta), 'export_refund', $1::uuid, now()
        FROM credit_ledger
        WHERE edit_job_id = $1::uuid
        GROUP BY user_id
        HAVING SUM(delta) < 0
        ON CONFLICT (edit_job_id, reason) DO NOTHING
        """,
        job_id,
    )
