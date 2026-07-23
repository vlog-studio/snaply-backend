import admin from 'firebase-admin';
import type { FirebaseConfig } from '../config.js';
import { getPrisma } from '../db/client.js';

let app: admin.app.App | null = null;
let dryRun = true;

export function initFcm(config: FirebaseConfig): void {
  if (config.serviceAccountJson) {
    try {
      const credentials = JSON.parse(config.serviceAccountJson) as admin.ServiceAccount;
      app = admin.initializeApp({ credential: admin.credential.cert(credentials) });
      dryRun = false;
      return;
    } catch {
      // 파싱 실패 시 dry-run으로 폴백
    }
  }
  dryRun = true;
}

export interface PushMessage {
  title: string;
  body: string;
  data?: Record<string, string>;
}

export type SendResult =
  | { sent: true; dryRun: boolean }
  | { sent: false; reason: 'no_token' | 'token_invalid' | 'send_error' };

/**
 * 유저에게 FCM 발송. 토큰 없음/무효/에러는 예외 없이 결과로 반환한다.
 * 개발(서비스 계정 미설정) 환경에서는 실제 발송 대신 로그만 남긴다(dry-run).
 */
export async function sendToUser(
  logger: { info: (o: object, m?: string) => void; warn: (o: object, m?: string) => void },
  userId: string,
  message: PushMessage,
): Promise<SendResult> {
  const user = await getPrisma().user.findUnique({
    where: { id: userId },
    select: { fcmToken: true },
  });
  if (!user?.fcmToken) {
    return { sent: false, reason: 'no_token' };
  }

  if (dryRun || !app) {
    logger.info({ userId, message }, '[FCM dry-run] 알림 발송(모의)');
    return { sent: true, dryRun: true };
  }

  try {
    await admin.messaging(app).send({
      token: user.fcmToken,
      notification: { title: message.title, body: message.body },
      data: message.data,
    });
    return { sent: true, dryRun: false };
  } catch (err) {
    const code = (err as { errorInfo?: { code?: string }; code?: string }).errorInfo?.code
      ?? (err as { code?: string }).code;
    // 무효 토큰은 정리 (앱 재설치/만료)
    if (code === 'messaging/registration-token-not-registered') {
      await getPrisma().user.update({ where: { id: userId }, data: { fcmToken: null } });
      return { sent: false, reason: 'token_invalid' };
    }
    logger.warn({ userId, code }, 'FCM 발송 실패');
    return { sent: false, reason: 'send_error' };
  }
}

export function isFcmDryRun(): boolean {
  return dryRun;
}
