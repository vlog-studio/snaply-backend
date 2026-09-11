"""알림 요청을 큐에 넣는다 — **보내지는 않는다.**

발송은 Node(API 쪽 알림 워커)가 한다. 이유는 셋이다:

- FCM 서비스 계정을 두 서비스에 나눠 주지 않아도 된다
- 조용한 시간대·알림 설정 판정이 한 언어에만 있다. 두 곳에 두면 한쪽만 고쳐져도 아무도 모른다
- Redis pub/sub 이 아니라 **큐**라서, 발송 쪽이 잠깐 죽어도 알림이 사라지지 않고
  API 를 여러 개 띄워도 한 번만 발송된다

**알림 실패가 작업을 실패시키지 않는다.** 영상은 이미 만들어졌고 사용자는 앱을 열면 볼 수
있다 — 여기서 예외를 올리면 BullMQ 가 편집을 통째로 재시도한다.
"""

from bullmq import Queue
from loguru import logger

import config

_queue: Queue | None = None


def _get_queue() -> Queue:
    global _queue
    if _queue is None:
        _queue = Queue(config.NOTIFICATION_QUEUE_NAME, {"connection": config.REDIS_URL})
    return _queue


async def movie_ready(user_id: str, video_id: str) -> None:
    """브이로그 생성이 끝났음을 알린다. 어떤 무비였는지는 발송 쪽이 결과물로 찾는다."""
    try:
        await _get_queue().add(
            "movie_ready",
            {"type": "movie_ready", "userId": user_id, "videoId": video_id},
            # 같은 결과물에 대한 중복 적재를 막는다(재시도로 두 번 들어오는 경우).
            # BullMQ 는 같은 jobId 의 두 번째 추가를 무시한다.
            {"jobId": f"movie_ready:{video_id}", "removeOnComplete": True},
        )
    except Exception as exc:  # noqa: BLE001 — 알림은 작업의 성패와 무관하다
        logger.warning("완료 알림 적재 실패 video_id={} err={!r}", video_id, exc)


async def close() -> None:
    global _queue
    if _queue is not None:
        await _queue.close()
        _queue = None
