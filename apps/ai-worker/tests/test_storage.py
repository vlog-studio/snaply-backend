import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

SRC = Path(__file__).resolve().parents[1] / "src"

# 깨끗한 인터프리터에서 돌린다. 다른 테스트가 boto3 를 MagicMock 으로 바꿔 끼우고(test_rendition_worker),
# config 는 import 시점에 환경을 읽으므로 같은 프로세스에서는 compose 가 준 환경을 재현할 수 없다.
_SCRIPT = """
import json, sys
sys.path.insert(0, sys.argv[1])
import config, storage
print(json.dumps({
    "key_id": config.AWS_ACCESS_KEY_ID,
    "url": storage.download_url("uploads/user-id/video-id.mp4"),
}))
"""


class CredentialsTest(unittest.TestCase):
    """AWS 서버는 키 없이 인스턴스 역할로 S3 에 붙는다.

    compose 가 키를 ""로 덮으므로, 빈 값이 None 이 되어 boto3 기본 체인으로 넘어가야 한다.
    빈 문자열을 그대로 넘기면 boto3 는 체인을 타지 않고 빈 키로 서명해 모든 요청이 거부된다.
    인스턴스 메타데이터 자리는 기본 체인의 공유 자격증명 파일이 대신한다.
    """

    def _run(self, **env: str) -> dict:
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        credentials = Path(tmp.name) / "credentials"
        credentials.write_text(
            "[default]\n"
            "aws_access_key_id = ASIATESTROLEKEY\n"
            "aws_secret_access_key = test-role-secret\n"
            "aws_session_token = test-role-session\n",
            encoding="utf-8",
        )
        base = {
            "PATH": os.environ.get("PATH", ""),
            "AWS_SHARED_CREDENTIALS_FILE": str(credentials),
            "AWS_CONFIG_FILE": str(Path(tmp.name) / "config"),
            "AWS_EC2_METADATA_DISABLED": "true",
            "AWS_REGION": "ap-northeast-2",
            "S3_BUCKET_NAME": "snaply-test",
            # 빈 값으로 둔다 — 개발자의 apps/api/.env 가 MinIO 주소를 채우지 못하게(setdefault).
            "S3_ENDPOINT": "",
            "S3_PUBLIC_ENDPOINT": "",
        }
        result = subprocess.run(
            [sys.executable, "-c", _SCRIPT, str(SRC)],
            env={**base, **env},
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout.strip().splitlines()[-1])

    def test_blank_keys_sign_with_the_default_chain(self) -> None:
        out = self._run(AWS_ACCESS_KEY_ID="", AWS_SECRET_ACCESS_KEY="")
        self.assertIsNone(out["key_id"])

        url = urlparse(out["url"])
        query = parse_qs(url.query)
        # 리전 호스트다 — 전역 호스트는 새 버킷에서 307 을 돌려줄 수 있다(storage._s3_config).
        self.assertEqual(url.netloc, "snaply-test.s3.ap-northeast-2.amazonaws.com")
        self.assertEqual(url.path, "/uploads/user-id/video-id.mp4")
        self.assertTrue(query["X-Amz-Credential"][0].startswith("ASIATESTROLEKEY/"))
        # 임시 자격증명(인스턴스 역할)은 세션 토큰이 URL 에 함께 실린다.
        self.assertEqual(query["X-Amz-Security-Token"], ["test-role-session"])

    def test_static_keys_win_over_the_chain(self) -> None:
        # MinIO·개발용 정적 키가 있으면 체인보다 그 키가 쓰인다.
        out = self._run(AWS_ACCESS_KEY_ID="minioadmin", AWS_SECRET_ACCESS_KEY="minioadmin123")
        self.assertEqual(out["key_id"], "minioadmin")
        query = parse_qs(urlparse(out["url"]).query)
        self.assertTrue(query["X-Amz-Credential"][0].startswith("minioadmin/"))
        self.assertNotIn("X-Amz-Security-Token", query)


if __name__ == "__main__":
    unittest.main()
