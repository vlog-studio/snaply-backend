"""스냅 로컬 신호(`video_signals`)의 DB 접근 — 렌디션 워커가 쓴다.

스냅 하나에 한 행이다. 계산 방법이 바뀌면(`SIGNALS_VERSION`) 같은 행을 새 값으로 덮는다.
지운 스냅에는 쓰지 않는다 — purge 가 지운 행을 늦게 끝난 작업이 되살리면 안 된다.
"""

import json

import db
from pipeline.snap_signals import SnapSignals


async def save_signals(video_id: str, signals: SnapSignals) -> bool:
    """신호를 반영한다. False 면 그 사이 스냅이 삭제된 것이다."""
    async with db.pool().acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO video_signals "
            "  (video_id, signals_version, duration_ms, step_ms, brightness, sharpness, "
            "   frame_hashes, motion, has_audio, speech, updated_at) "
            "SELECT id, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, now() "
            "  FROM videos WHERE id=$1 AND deleted_at IS NULL "
            "ON CONFLICT (video_id) DO UPDATE SET "
            "  signals_version=EXCLUDED.signals_version, duration_ms=EXCLUDED.duration_ms, "
            "  step_ms=EXCLUDED.step_ms, brightness=EXCLUDED.brightness, "
            "  sharpness=EXCLUDED.sharpness, frame_hashes=EXCLUDED.frame_hashes, "
            "  motion=EXCLUDED.motion, has_audio=EXCLUDED.has_audio, speech=EXCLUDED.speech, "
            "  updated_at=now() "
            "RETURNING video_id",
            video_id,
            signals.version,
            signals.duration_ms,
            signals.step_ms,
            signals.brightness,
            signals.sharpness,
            list(signals.frame_hashes),
            list(signals.motion),
            signals.has_audio,
            json.dumps([list(span) for span in signals.speech]),
        )
    return row is not None
