import * as Sentry from '@sentry/node';

let enabled = false;

/** SENTRY_DSN이 있을 때만 초기화. 없으면 캡처는 no-op. */
export function initSentry(dsn: string | undefined): void {
  if (!dsn) {
    return;
  }
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? 'development',
    tracesSampleRate: 0,
    // SENTRY_DEBUG=true 면 SDK가 전송 과정을 stdout에 남긴다 (DSN/전송 확인용).
    debug: process.env.SENTRY_DEBUG === 'true',
  });
  enabled = true;
}

/**
 * 대기 중인 이벤트를 전송 완료까지 기다린다.
 * 프로세스가 곧 종료되는 경로(스크립트/워커 종료)에서 유실을 막는 용도.
 */
export async function flushSentry(timeoutMs = 3000): Promise<boolean> {
  if (!enabled) {
    return true;
  }
  return Sentry.flush(timeoutMs);
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) {
    return;
  }
  Sentry.captureException(err, context ? { extra: context } : undefined);
}

export function isSentryEnabled(): boolean {
  return enabled;
}
