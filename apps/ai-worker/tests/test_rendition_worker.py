"""렌디션 워커의 작업 흐름 — 변환 도중 스냅이 지워진 경우와, 렌디션 뒤의 로컬 신호.

ffmpeg·S3·DB 없이 돈다. 변환(`build`)과 저장소·DB 호출을 가짜로 두고, 워커가 **무엇을 지우는지**만
본다. 반영하지 못한 렌디션을 남기면 지운 스냅의 재생 가능한 사본이 계정 purge 전까지 남는다
(backlog E-8) — 행에 키가 없어서 정리 배치도 그 객체를 모르기 때문이다.

    cd apps/ai-worker && python -m unittest tests.test_rendition_worker
"""

import asyncio
import sys
import time
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
# 워커 런타임 의존성 없이 흐름만 검증한다 (test_editor.py 와 같은 방식).
for name in ("loguru", "bullmq", "asyncpg", "boto3", "botocore", "botocore.config"):
    sys.modules.setdefault(name, mock.MagicMock())

import rendition_worker  # noqa: E402
from pipeline.rendition import RenditionOutcome  # noqa: E402
from pipeline.snap_signals import SIGNALS_VERSION, SignalsError, SnapSignals  # noqa: E402

SIGNALS = SnapSignals(3000, 0.5, 300.0, ("0" * 16,) * 3, (0.01,) * 29, False, ())

VIDEO_ID = "11111111-1111-1111-1111-111111111111"
USER_ID = "22222222-2222-2222-2222-222222222222"


class _WorkerCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.db = mock.patch.object(rendition_worker, "rendition_db").start()
        self.db.fetch_context = mock.AsyncMock(
            return_value={"deleted_at": None, "rendition_status": "pending"}
        )
        self.db.mark_processing = mock.AsyncMock(return_value=True)
        self.storage = mock.patch.object(rendition_worker, "storage").start()
        self.storage.rendition_key.return_value = f"uploads/{USER_ID}/renditions/{VIDEO_ID}.mp4"
        self.storage.snap_thumbnail_key.return_value = f"uploads/{USER_ID}/thumbnails/{VIDEO_ID}.jpg"
        mock.patch.object(
            rendition_worker,
            "build",
            return_value=RenditionOutcome("/tmp/out.mp4", "/tmp/thumb.jpg", 3000, 720, 1280),
        ).start()
        self.signals_db = mock.patch.object(rendition_worker, "signals_db").start()
        self.signals_db.save_signals = mock.AsyncMock(return_value=True)
        self.read_signals = mock.patch.object(rendition_worker, "read_signals", return_value=SIGNALS).start()
        self.capture = mock.patch.object(rendition_worker, "_capture").start()
        self.addCleanup(mock.patch.stopall)


class RunTest(_WorkerCase):
    async def test_deleted_during_conversion_removes_uploaded_objects(self) -> None:
        self.db.save_rendition = mock.AsyncMock(return_value=False)

        with self.assertRaises(rendition_worker.RenditionSkipped):
            await rendition_worker._run(VIDEO_ID, USER_ID, "uploads/x/source.mov", "/tmp")

        deleted = [call.args[0] for call in self.storage.delete.call_args_list]
        self.assertEqual(
            sorted(deleted),
            sorted(
                [
                    f"uploads/{USER_ID}/renditions/{VIDEO_ID}.mp4",
                    f"uploads/{USER_ID}/thumbnails/{VIDEO_ID}.jpg",
                ]
            ),
        )

    async def test_saved_rendition_is_kept_with_its_dimensions(self) -> None:
        self.db.save_rendition = mock.AsyncMock(return_value=True)

        await rendition_worker._run(VIDEO_ID, USER_ID, "uploads/x/source.mov", "/tmp")

        self.storage.delete.assert_not_called()
        args = self.db.save_rendition.call_args.args
        self.assertEqual(args[-2:], (720, 1280))

    async def test_cleanup_failure_still_skips_the_job(self) -> None:
        # 정리 실패로 작업을 재시도하면 같은 변환을 다시 돌리게 된다 — 건너뜀은 그대로다.
        self.db.save_rendition = mock.AsyncMock(return_value=False)
        self.storage.delete.side_effect = RuntimeError("s3 down")

        with self.assertRaises(rendition_worker.RenditionSkipped):
            await rendition_worker._run(VIDEO_ID, USER_ID, "uploads/x/source.mov", "/tmp")


class SignalsAfterRenditionTest(_WorkerCase):
    async def test_signals_are_read_from_the_downloaded_original_and_saved(self) -> None:
        self.db.save_rendition = mock.AsyncMock(return_value=True)

        await rendition_worker._run(VIDEO_ID, USER_ID, "uploads/x/source.mov", "/tmp")

        path, duration = self.read_signals.call_args.args
        self.assertEqual(path, "/tmp/source.mov")
        self.assertEqual(duration, 3000)
        self.signals_db.save_signals.assert_awaited_once_with(VIDEO_ID, SIGNALS)

    async def test_a_signals_failure_does_not_fail_the_rendition(self) -> None:
        self.db.save_rendition = mock.AsyncMock(return_value=True)
        self.read_signals.side_effect = SignalsError("no frames")

        await rendition_worker._run(VIDEO_ID, USER_ID, "uploads/x/source.mov", "/tmp")

        self.signals_db.save_signals.assert_not_called()
        # 읽을 수 없는 파일은 예상한 실패라 Sentry 로 보내지 않는다.
        self.capture.assert_not_called()

    async def test_an_unexpected_signals_error_is_reported_but_not_raised(self) -> None:
        self.db.save_rendition = mock.AsyncMock(return_value=True)
        self.signals_db.save_signals = mock.AsyncMock(side_effect=RuntimeError("db down"))

        await rendition_worker._run(VIDEO_ID, USER_ID, "uploads/x/source.mov", "/tmp")

        self.capture.assert_called_once()

    async def test_no_signals_for_a_snap_deleted_during_conversion(self) -> None:
        self.db.save_rendition = mock.AsyncMock(return_value=False)

        with self.assertRaises(rendition_worker.RenditionSkipped):
            await rendition_worker._run(VIDEO_ID, USER_ID, "uploads/x/source.mov", "/tmp")

        self.read_signals.assert_not_called()


class TimeLimitTest(_WorkerCase):
    """렌디션과 신호는 시간 제한을 따로 받는다 — 늦은 신호가 반영한 렌디션을 `failed` 로 덮으면 안 된다."""

    def setUp(self) -> None:
        super().setUp()
        self.db.save_rendition = mock.AsyncMock(return_value=True)
        self.db.mark_failed = mock.AsyncMock()
        mock.patch.object(rendition_worker.config, "RENDITION_TIMEOUT_SECONDS", 0.05).start()

    def _job(self) -> mock.MagicMock:
        job = mock.MagicMock()
        job.data = {"videoId": VIDEO_ID, "userId": USER_ID, "s3Key": "uploads/x/source.mov"}
        return job

    async def test_slow_signals_leave_the_saved_rendition_ready(self) -> None:
        self.read_signals.side_effect = lambda *_: time.sleep(0.3)

        result = await rendition_worker.process_rendition_job(self._job(), None)

        self.assertEqual(result["status"], "ready")
        self.db.mark_failed.assert_not_awaited()
        self.signals_db.save_signals.assert_not_called()
        # 시간 초과는 예상한 실패가 아니라 Sentry 로 보낸다.
        self.capture.assert_called_once()

    async def test_a_slow_rendition_still_fails_and_retries(self) -> None:
        mock.patch.object(rendition_worker, "build", side_effect=lambda *_: time.sleep(0.3)).start()

        with self.assertRaises(asyncio.TimeoutError):
            await rendition_worker.process_rendition_job(self._job(), None)

        self.db.mark_failed.assert_awaited_once_with(VIDEO_ID)
        self.read_signals.assert_not_called()


class SignalsOnlyJobTest(_WorkerCase):
    def _job(self) -> mock.MagicMock:
        job = mock.MagicMock()
        job.data = {"videoId": VIDEO_ID, "userId": USER_ID, "s3Key": "uploads/x/source.mov", "only": "signals"}
        return job

    async def test_reads_signals_without_making_a_rendition(self) -> None:
        build = mock.patch.object(rendition_worker, "build").start()

        result = await rendition_worker.process_rendition_job(self._job(), None)

        self.assertEqual(result["status"], "ready")
        build.assert_not_called()
        self.db.mark_processing.assert_not_called()
        self.signals_db.save_signals.assert_awaited_once_with(VIDEO_ID, SIGNALS)

    async def test_skips_a_deleted_snap(self) -> None:
        self.db.fetch_context = mock.AsyncMock(return_value={"deleted_at": "2026-10-01", "rendition_status": "ready"})

        result = await rendition_worker.process_rendition_job(self._job(), None)

        self.assertEqual(result["status"], "skipped")
        self.read_signals.assert_not_called()

    async def test_an_unreadable_file_fails_without_retry(self) -> None:
        self.read_signals.side_effect = SignalsError("no frames")

        result = await rendition_worker.process_rendition_job(self._job(), None)

        self.assertEqual(result["status"], "failed")
        # API 는 이 버전으로 읽지 못한 스냅을 다시 돌리지 않는다 — 버전이 없으면 매 초안 요청마다 다시 계산한다.
        self.assertEqual(result["signalsVersion"], SIGNALS_VERSION)


if __name__ == "__main__":
    unittest.main()
