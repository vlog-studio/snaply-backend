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
  });
  enabled = true;
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
