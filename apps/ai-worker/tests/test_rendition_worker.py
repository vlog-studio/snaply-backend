"""렌디션 워커의 작업 흐름 — 변환 도중 스냅이 지워진 경우.

ffmpeg·S3·DB 없이 돈다. 변환(`build`)과 저장소·DB 호출을 가짜로 두고, 워커가 **무엇을 지우는지**만
본다. 반영하지 못한 렌디션을 남기면 지운 스냅의 재생 가능한 사본이 계정 purge 전까지 남는다
(backlog E-8) — 행에 키가 없어서 정리 배치도 그 객체를 모르기 때문이다.

    cd apps/ai-worker && python -m unittest tests.test_rendition_worker
"""

import sys
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
# 워커 런타임 의존성 없이 흐름만 검증한다 (test_editor.py 와 같은 방식).
for name in ("loguru", "bullmq", "asyncpg", "boto3", "botocore", "botocore.config"):
    sys.modules.setdefault(name, mock.MagicMock())

import rendition_worker  # noqa: E402
from pipeline.rendition import RenditionOutcome  # noqa: E402

VIDEO_ID = "11111111-1111-1111-1111-111111111111"
USER_ID = "22222222-2222-2222-2222-222222222222"


class RunTest(unittest.IsolatedAsyncioTestCase):
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
        self.addCleanup(mock.patch.stopall)

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


if __name__ == "__main__":
    unittest.main()
