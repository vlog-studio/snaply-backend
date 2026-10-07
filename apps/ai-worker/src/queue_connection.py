"""BullMQ 워커의 Redis 연결 — Node 가 알아보는 연결 이름을 붙인다.

Node 의 BullMQ 는 워커 연결에 `bull:<base64 큐 이름>:w:<이름>` 을 붙이고, `Queue.getWorkers()` 는 `CLIENT LIST` 에서
그 이름으로 워커를 찾는다. Python bullmq(2.x)는 이름을 붙이지 않아 떠 있는 Python 워커가 Node 쪽에서는 늘 0개였다
(backlog E-11 — `scripts/analysis-run.mjs` 가 워커가 없다고 경고했다). 연결 URL 의 `client_name` 은 redis-py 가 연결을
열 때마다 `CLIENT SETNAME` 으로 보내므로 다시 접속한 연결도 같은 이름을 갖는다.

워커 하나가 연결을 여럿 연다(일반 · 블로킹, 동시 처리만큼 풀이 늘어난다). 그래서 `getWorkers()` 의 길이는 연결 수이고,
워커 프로세스 수는 이름을 중복 없이 세야 나온다 — 이름 끝의 `<호스트>-<pid>` 가 프로세스를 가른다(컨테이너는 pid 가
모두 1 이라 호스트 이름이 가른다).
"""

import base64
import os
import socket
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

# Python bullmq 와 Node BullMQ 의 기본 키 접두사. 둘 다 바꾸지 않았다.
QUEUE_PREFIX = "bull"


def worker_client_name(queue_name: str) -> str:
    queue = base64.b64encode(queue_name.encode()).decode()
    return f"{QUEUE_PREFIX}:{queue}:w:{socket.gethostname()}-{os.getpid()}"


def worker_connection(redis_url: str, queue_name: str) -> str:
    """`redis_url` 에 이 큐의 워커 이름을 얹은 연결 URL. 다른 쿼리 인자는 그대로 둔다."""
    parts = urlsplit(redis_url)
    query = [(key, value) for key, value in parse_qsl(parts.query, keep_blank_values=True) if key != "client_name"]
    query.append(("client_name", worker_client_name(queue_name)))
    return urlunsplit(parts._replace(query=urlencode(query)))
