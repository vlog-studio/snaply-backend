/**
 * 브이로그 생성 완료 알림.
 *
 * 완료를 아는 것은 Python 워커인데 FCM 은 여기(Node)에 있다. 워커가 알림 **요청**만 큐에
 * 넣고 발송은 이쪽이 맡는 구조라, 서비스 계정이 한 곳에만 있고 조용한 시간대·알림 설정
 * 판정도 한 번만 구현된다(`scripts/notification-worker.ts` 가 큐를 소비한다).
 *
 * 만료 예고와 달리 **놓쳐도 데이터를 잃지 않는다** — 사용자가 앱을 열면 완성된 무비가 거기
 * 있다. 그래서 조용한 시간대에는 보내지 않고 버린다. 새벽 3시에 "브이로그가 완성됐어요" 는
 * 사용자가 그 설정을 둔 이유를 정면으로 어긴다.
 */
import { getPrisma } from '../db/client.js';
import { isQuietNow } from '../lib/quiet-hours.js';
import { sendToUser } from './fcm.service.js';

interface Logger {
  info: (o: object, m?: string) => void;
  warn: (o: object, m?: string) => void;
}

export type MovieReadyResult =
  | { notified: true; movieId: string | null }
  | {
      notified: false;
      reason: 'no_movie' | 'notifications_disabled' | 'quiet_hours' | 'no_token' | 'send_failed';
    };

/**
 * 결과물 영상을 단서로 그 무비의 완성을 알린다.
 *
 * 무비를 못 찾으면 보내지 않는다 — 옛 `POST /edit-jobs` 로 직접 만든 결과물은 사용자가
 * 보고 있는 화면이 따로 있고, "무엇이" 완성됐는지 말할 수 없는 알림은 보내지 않는 편이 낫다.
 */
export async function notifyMovieReady(params: {
  logger: Logger;
  userId: string;
  videoId: string;
  now?: Date;
}): Promise<MovieReadyResult> {
  const now = params.now ?? new Date();
  const prisma = getPrisma();

  const movie = await prisma.movie.findFirst({
    where: {
      userId: params.userId,
      resultVideoId: params.videoId,
      deletedAt: null,
    },
    select: { id: true, title: true },
  });
  if (!movie) {
    return { notified: false, reason: 'no_movie' };
  }

  const user = await prisma.user.findUnique({
    where: { id: params.userId },
    select: { notificationEnabled: true, quietStart: true, quietEnd: true, deletedAt: true },
  });
  if (!user || user.deletedAt || !user.notificationEnabled) {
    return { notified: false, reason: 'notifications_disabled' };
  }
  if (isQuietNow(user.quietStart, user.quietEnd, now)) {
    return { notified: false, reason: 'quiet_hours' };
  }

  const result = await sendToUser(params.logger, params.userId, {
    title: 'Snaply',
    body: `'${movie.title}' 브이로그가 완성됐어요. 확인해 보세요!`,
    // 앱이 곧장 그 무비를 열 수 있게 id 를 싣는다.
    data: { kind: 'movie_ready', movieId: movie.id, videoId: params.videoId },
  });
  if (!result.sent) {
    return {
      notified: false,
      reason: result.reason === 'no_token' ? 'no_token' : 'send_failed',
    };
  }
  return { notified: true, movieId: movie.id };
}
