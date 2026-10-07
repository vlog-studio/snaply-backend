"""워커 연결 이름 — Node 의 `Queue.getWorkers()` 가 Python 워커를 알아봐야 한다(backlog E-11).

    cd apps/ai-worker && python -m unittest tests.test_queue_connection
"""

import base64
import importlib.util
import sys
import unittest
from pathlib import Path
from unittest import mock
from urllib.parse import parse_qs, urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from queue_connection import worker_client_name, worker_connection  # noqa: E402


def client_name_of(url: str) -> str:
    return parse_qs(urlsplit(url).query)["client_name"][0]


class WorkerClientNameTest(unittest.TestCase):
    def test_matches_the_name_node_bullmq_looks_for(self) -> None:
        # Node: `${prefix}:${base64(queueName)}:w:` 로 시작하는 이름을 워커로 센다(queue-getters.js getWorkers).
        with mock.patch("socket.gethostname", return_value="host"), mock.patch("os.getpid", return_value=7):
            name = worker_client_name("video-analysis")

        queue = base64.b64encode(b"video-analysis").decode()
        self.assertEqual(name, f"bull:{queue}:w:host-7")

    def test_name_has_no_space(self) -> None:
        # Redis 는 공백이 든 이름을 거절한다 — 그러면 연결 자체가 실패한다.
        self.assertNotIn(" ", worker_client_name("edit-jobs"))


class WorkerConnectionTest(unittest.TestCase):
    def test_adds_the_worker_name(self) -> None:
        url = worker_connection("redis://localhost:6379", "renditions")

        self.assertTrue(url.startswith("redis://localhost:6379?"))
        self.assertEqual(client_name_of(url), worker_client_name("renditions"))

    def test_keeps_other_query_arguments_and_replaces_an_existing_name(self) -> None:
        url = worker_connection("rediss://:pw@cache:6380/2?ssl_cert_reqs=none&client_name=old", "renditions")

        query = parse_qs(urlsplit(url).query)
        self.assertEqual(query["ssl_cert_reqs"], ["none"])
        self.assertEqual(query["client_name"], [worker_client_name("renditions")])
        self.assertTrue(url.startswith("rediss://:pw@cache:6380/2?"))

    @unittest.skipIf(importlib.util.find_spec("redis") is None, "redis-py 가 없다(워커 이미지·CI 에서 돈다)")
    def test_redis_py_reads_the_name_back_unescaped(self) -> None:
        # 이름의 `:`·`=` 는 URL 에서 이스케이프된다. redis-py 가 되돌려 읽지 못하면 Node 가 다른 이름을 본다.
        import redis.asyncio as aioredis

        url = worker_connection("redis://localhost:6379/0", "video-analysis")
        client = aioredis.from_url(url)

        self.assertEqual(client.connection_pool.connection_kwargs["client_name"], worker_client_name("video-analysis"))


if __name__ == "__main__":
    unittest.main()
