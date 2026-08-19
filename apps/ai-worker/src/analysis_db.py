"""asyncpg 기반 video_analyses 상태 전이.

풀은 `db.py` 것을 그대로 쓴다 — 워커 한 프로세스에 풀이 둘 생기면 커넥션 상한을 두 배로 먹는다.

상태 전이는 모두 **조건부 UPDATE + RETURNING** 이다. 영상 삭제와 결과 반영이 경쟁하면
"삭제된 영상에 결과가 남는" 쪽으로 기울지 않게, 갱신 대상이 없으면 False 를 돌려
호출자가 중단하게 만든다.
"""

from datetime import datetime, timezone

import db

# 어느 상태에서 processing 으로 들어갈 수 있는가.
# failed 를 포함하는 이유: BullMQ 재시도와 API 의 재요청이 모두 같은 행을 재사용한다.
# done 은 빠져 있다 — 완료된 분석을 다시 처리하지 않는다.
STARTABLE_STATUSES = ("queued", "processing", "failed")


async def fetch_context(analysis_id: str) -> dict | None:
    """분석 대상의 현재 상태 + 원본 스냅 정보. 영상이 없거나 삭제됐으면 video_* 가 None."""
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "SELECT a.id, a.status, a.analysis_version, a.user_id, a.video_id, a.attempts, "
            "       v.s3_key AS video_s3_key, v.status AS video_status, v.kind AS video_kind "
            "  FROM video_analyses a "
            "  LEFT JOIN videos v "
            "    ON v.id = a.video_id AND v.deleted_at IS NULL "
            " WHERE a.id = $1",
            analysis_id,
        )
    if row is None:
        return None
    return {
        "id": str(row["id"]),
        "status": row["status"],
        "analysis_version": row["analysis_version"],
        "user_id": str(row["user_id"]),
        "video_id": str(row["video_id"]),
        "attempts": row["attempts"],
        "video_s3_key": row["video_s3_key"],
        "video_status": row["video_status"],
        "video_kind": row["video_kind"],
    }


async def mark_processing(analysis_id: str) -> bool:
    """processing 으로 전이하고 attempts 를 올린다.

    False 면 이미 done 이거나 행이 사라진 것 — 그 작업은 다시 실행하지 않는다.
    attempts 는 BullMQ 작업이 지워진 뒤에도 시도 횟수를 알 수 있도록 DB 에도 센다.
    """
    now = datetime.now(timezone.utc)
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "UPDATE video_analyses "
            "   SET status='processing', started_at=$2, attempts=attempts+1, updated_at=$2 "
            " WHERE id=$1 AND status IN ('queued','processing','failed') RETURNING id",
            analysis_id,
            now,
        )
    return row is not None


async def save_result(
    analysis_id: str,
    duration_ms: int,
    frame_timestamps_ms: list[int],
    result: dict,
    model_version: str,
    prompt_version: str,
    input_tokens: int | None,
    output_tokens: int | None,
) -> bool:
    """결과 반영. **processing 이고 영상이 살아 있을 때만** 성공한다.

    False 면 그 사이 영상이 삭제됐거나 다른 시도가 이미 결과를 채운 것이다 — 모델 응답을 버린다.
    같은 트랜잭션에서 videos.duration_seconds 를 실측값으로 교정한다(클라이언트가 보고한
    길이는 틀릴 수 있고, 실측은 여기서만 일어난다).
    """
    quality = result["visualQuality"]
    now = datetime.now(timezone.utc)
    async with db.pool().acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                "UPDATE video_analyses a "
                "   SET status='done', duration_ms=$2, frame_timestamps_ms=$3, summary=$4, "
                "       topics=$5, places=$6, objects=$7, actions=$8, moods=$9, "
                "       visual_quality_score=$10, visual_issues=$11, usable_for_edit=$12, "
                "       confidence=$13, model_version=$14, prompt_version=$15, "
                "       input_tokens=$16, output_tokens=$17, error_code=NULL, "
                "       error_message=NULL, completed_at=$18, updated_at=$18 "
                "  FROM videos v "
                " WHERE a.id=$1 AND a.status='processing' "
                "   AND v.id = a.video_id AND v.deleted_at IS NULL "
                " RETURNING a.video_id",
                analysis_id,
                duration_ms,
                frame_timestamps_ms,
                result["summary"],
                result["topics"],
                result["places"],
                result["objects"],
                result["actions"],
                result["moods"],
                quality["score"],
                quality["issues"],
                quality["usableForEdit"],
                result["confidence"],
                model_version,
                prompt_version,
                input_tokens,
                output_tokens,
                now,
            )
            if row is None:
                return False
            await conn.execute(
                "UPDATE videos SET duration_seconds=$2 WHERE id=$1 AND deleted_at IS NULL",
                row["video_id"],
                round(duration_ms / 1000),
            )
    return True


async def mark_failed(analysis_id: str, error_code: str, error_message: str) -> None:
    """실패 기록. 이미 done 인 행은 덮지 않는다.

    **원본 영상의 status 는 건드리지 않는다** — 분석 실패는 업로드 실패가 아니다
    (docs/decisions/snap-content-analysis.md).
    """
    now = datetime.now(timezone.utc)
    async with db.pool().acquire() as conn:
        await conn.execute(
            "UPDATE video_analyses "
            "   SET status='failed', error_code=$2, error_message=$3, "
            "       completed_at=$4, updated_at=$4 "
            " WHERE id=$1 AND status <> 'done'",
            analysis_id,
            error_code[:40],
            error_message[:1000],
            now,
        )
