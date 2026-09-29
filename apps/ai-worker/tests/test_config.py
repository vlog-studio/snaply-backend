import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import config  # noqa: E402
from config import _parse_value  # noqa: E402


class ParseValueTest(unittest.TestCase):
    """`.env` 값 파싱은 Node 의 --env-file 과 같은 규칙을 따라야 한다.

    워커가 API 와 같은 `apps/api/.env` 를 읽으므로, 한쪽만 주석을 값으로 읽으면
    두 프로세스의 설정이 조용히 갈린다.
    """

    def test_inline_comment_after_value_is_dropped(self) -> None:
        self.assertEqual(_parse_value("redis://localhost:6379   # 개발용"), "redis://localhost:6379")

    def test_comment_only_value_is_empty(self) -> None:
        # `KEY=            # 설명` 형태. 주석이 값이 되면 안 된다.
        self.assertEqual(_parse_value("            # 설명"), "")

    def test_hash_without_leading_space_is_part_of_value(self) -> None:
        # 비밀번호 등에 들어간 `#` 는 주석이 아니다.
        self.assertEqual(_parse_value("pa#ss"), "pa#ss")

    def test_quoted_value_drops_quotes_and_trailing_comment(self) -> None:
        self.assertEqual(_parse_value('"snaply://"   # 딥링크'), "snaply://")
        self.assertEqual(_parse_value("'small'"), "small")

    def test_plain_value(self) -> None:
        self.assertEqual(_parse_value("  small  "), "small")


class LoadDotenvTest(unittest.TestCase):
    """`apps/ai-worker/.env` 는 덮어쓸 줄만 두는 파일이다 — `apps/api/.env` 를 가리면 안 된다.

    전에는 워커 파일이 있으면 그 파일만 읽었다. 문서대로 `DATABASE_URL` 한 줄만 두면
    `OPENAI_API_KEY`·S3 값이 통째로 사라져 분석 워커가 기동 단계에서 종료됐다.
    """

    def setUp(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.worker_env = Path(tmp.name) / "worker.env"
        self.api_env = Path(tmp.name) / "api.env"
        self.api_env.write_text(
            "DATABASE_URL=postgresql://pooler:6543/snaply\n"
            "REDIS_URL=redis://localhost:6379\n"
            "OPENAI_API_KEY=test-key\n",
            encoding="utf-8",
        )

    def _load(self, **injected: str) -> dict:
        with mock.patch.dict(os.environ, injected, clear=True), mock.patch.object(
            config, "ENV_CANDIDATES", (self.worker_env, self.api_env)
        ):
            config._load_dotenv()
            return dict(os.environ)

    def test_worker_file_overrides_only_its_own_keys(self) -> None:
        self.worker_env.write_text("DATABASE_URL=postgresql://direct:5432/snaply\n", encoding="utf-8")
        env = self._load()
        self.assertEqual(env["DATABASE_URL"], "postgresql://direct:5432/snaply")
        self.assertEqual(env.get("REDIS_URL"), "redis://localhost:6379")
        self.assertEqual(env.get("OPENAI_API_KEY"), "test-key")

    def test_api_file_alone(self) -> None:
        env = self._load()
        self.assertEqual(env["DATABASE_URL"], "postgresql://pooler:6543/snaply")
        self.assertEqual(env["OPENAI_API_KEY"], "test-key")

    def test_injected_value_beats_both_files(self) -> None:
        # 운영은 파일 없이 주입만 한다. 로컬에서도 셸에서 준 값이 두 파일보다 앞선다.
        self.worker_env.write_text("DATABASE_URL=postgresql://direct:5432/snaply\n", encoding="utf-8")
        env = self._load(DATABASE_URL="postgresql://injected:5432/snaply")
        self.assertEqual(env["DATABASE_URL"], "postgresql://injected:5432/snaply")


if __name__ == "__main__":
    unittest.main()
