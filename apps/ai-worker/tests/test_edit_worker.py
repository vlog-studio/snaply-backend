"""편집 워커의 실패 처리 — 일시적 실패는 큐의 다음 시도에 맡기고, 확정은 마지막에만 한다.

ffmpeg·S3·DB 없이 돈다. 파이프라인과 DB 호출을 가짜로 두고, 워커가 **언제 실패를 확정하는지**만 본다.
첫 예외에서 실패를 확정하면 큐의 재시도가 아무것도 하지 못하고 일시적 오류도 사용자에게 실패로 간다
(backlog E-27, specs/movie.md MOV-12).

    cd apps/ai-worker && python -m unittest tests.test_edit_worker
"""

import asyncio
import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
# 워커 런타임 의존성 없이 흐름만 검증한다 (test_rendition_worker.py 와 같은 방식).
for name in ("loguru", "bullmq", "asyncpg", "boto3", "botocore", "botocore.config"):
    sys.modules.setdefault(name, mock.MagicMock())

import worker  # noqa: E402

JOB_ID = "33333333-3333-3333-3333-333333333333"
USER_ID = "22222222-2222-2222-2222-222222222222"
VIDEO_ID = "11111111-1111-1111-1111-111111111111"


def _job(attempts_made: int = 0, attempts: int = 3) -> mock.Mock:
    job = mock.Mock()
    job.data = {"jobId": JOB_ID, "userId": USER_ID, "clips": [{"videoId": VIDEO_ID}], "editSpec": {"stylePreset": "일상"}}
    job.opts = {"attempts": attempts}
    job.attemptsMade = attempts_made
    job.discarded = False
    return job


class _WorkerCase(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self.db = mock.patch.object(worker, "db").start()
        self.db.mark_failed = mock.AsyncMock()
        self.db.requeue_for_retry = mock.AsyncMock(return_value=True)
        self.publish = mock.patch.object(worker, "_publish", new=mock.AsyncMock()).start()
        mock.patch.object(worker, "_capture").start()
        self.addCleanup(mock.patch.stopall)

    def fail_pipeline_with(self, exc: BaseException) -> None:
        mock.patch.object(worker, "_run_pipeline", new=mock.AsyncMock(side_effect=exc)).start()


class TransientFailureTest(_WorkerCase):
    async def test_an_early_attempt_goes_back_to_the_queue_without_failing(self) -> None:
        self.fail_pipeline_with(OSError("S3 연결 끊김"))
        job = _job(attempts_made=0)

        with self.assertRaises(OSError):
            await worker.process_edit_job(job, "token")

        self.db.requeue_for_retry.assert_awaited_once_with(JOB_ID)
        self.db.mark_failed.assert_not_awaited()
        self.publish.assert_awaited_once_with(JOB_ID, {"progress": 0, "step": worker.RETRY_STEP})
        self.assertFalse(job.discarded)

    async def test_the_last_attempt_settles_the_failure_and_refunds(self) -> None:
        self.fail_pipeline_with(OSError("S3 연결 끊김"))

        with self.assertRaises(OSError):
            await worker.process_edit_job(_job(attempts_made=2), "token")

        self.db.mark_failed.assert_awaited_once()
        self.assertEqual(self.db.mark_failed.await_args.args[2], "INTERNAL")
        self.db.requeue_for_retry.assert_not_awaited()
        frame = self.publish.await_args.args[1]
        self.assertEqual((frame["status"], frame["code"]), ("failed", "INTERNAL"))

    async def test_a_queue_without_retries_settles_on_the_first_failure(self) -> None:
        self.fail_pipeline_with(OSError("S3 연결 끊김"))

        with self.assertRaises(OSError):
            await worker.process_edit_job(_job(attempts=1), "token")

        self.db.mark_failed.assert_awaited_once()

    async def test_a_run_canceled_while_failing_is_not_retried(self) -> None:
        self.fail_pipeline_with(OSError("S3 연결 끊김"))
        self.db.requeue_for_retry = mock.AsyncMock(return_value=False)

        result = await worker.process_edit_job(_job(attempts_made=0), "token")

        self.assertEqual(result["status"], "canceled")
        self.db.mark_failed.assert_not_awaited()
        self.publish.assert_not_awaited()


class PermanentFailureTest(_WorkerCase):
    async def test_a_missing_original_fails_at_once_and_drops_the_retries(self) -> None:
        self.fail_pipeline_with(worker.SourceUnavailableError("원본 클립을 찾을 수 없습니다."))
        job = _job(attempts_made=0)

        with self.assertRaises(worker.SourceUnavailableError):
            await worker.process_edit_job(job, "token")

        self.assertEqual(self.db.mark_failed.await_args.args[2], "SOURCE_UNAVAILABLE")
        self.db.requeue_for_retry.assert_not_awaited()
        self.assertTrue(job.discarded)

    async def test_a_timeout_fails_at_once_and_drops_the_retries(self) -> None:
        self.fail_pipeline_with(asyncio.TimeoutError())
        job = _job(attempts_made=0)

        with self.assertRaises(asyncio.TimeoutError):
            await worker.process_edit_job(job, "token")

        self.assertEqual(self.db.mark_failed.await_args.args[2], "TIMEOUT")
        self.assertTrue(job.discarded)


class RefusedStartTest(_WorkerCase):
    """큐가 다시 넘긴 작업의 시작이 거절된 이유를 가른다 — 끝난 작업을 "취소"로 적지 않는다."""

    def setUp(self) -> None:
        super().setUp()
        self.db.fetch_job_context = mock.AsyncMock(return_value={"video_id": "44444444-4444-4444-4444-444444444444"})
        self.db.mark_processing = mock.AsyncMock(return_value=False)

    async def test_a_job_that_already_ended_is_skipped_as_settled(self) -> None:
        self.db.fetch_job_status = mock.AsyncMock(return_value="failed")

        result = await worker.process_edit_job(_job(attempts_made=1), "token")

        self.assertEqual(result["status"], "settled")
        self.db.mark_failed.assert_not_awaited()

    async def test_a_job_canceled_before_its_retry_stops_as_canceled(self) -> None:
        self.db.fetch_job_status = mock.AsyncMock(return_value="canceled")

        result = await worker.process_edit_job(_job(attempts_made=1), "token")

        self.assertEqual(result["status"], "canceled")
        self.db.mark_failed.assert_not_awaited()


if __name__ == "__main__":
    unittest.main()
