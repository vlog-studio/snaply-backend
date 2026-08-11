import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

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


if __name__ == "__main__":
    unittest.main()
