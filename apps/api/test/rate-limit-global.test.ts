/**
 * Phase 9 — 전역(IP 기준) rate limit 과 Stripe 웹훅 예외.
 * 전역 제한을 낮게 잡아야 검증이 가능하므로 인증이 필요 없는 라우트만 쓴다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHmac } from 'node:crypto';
import { createHarness, type Harness } from './helpers/harness.js';

let h: Harness;
const GLOBAL_MAX = 5;

beforeAll(async () => {
  h = await createHarness({ RATE_LIMIT_GLOBAL_MAX: String(GLOBAL_MAX) });
});
afterAll(async () => {
  await h.close();
});

describe('전역 rate limit', () => {
  it('IP당 한도를 넘기면 429 + 공통 에러 포맷', async () => {
    const codes: number[] = [];
    for (let i = 0; i < GLOBAL_MAX + 2; i += 1) {
      const res = await h.app.inject({ method: 'GET', url: '/billing/plans' });
      codes.push(res.statusCode);
      if (res.statusCode === 429) {
        expect(res.json()).toEqual({
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: '요청이 너무 많습니다. 잠시 후 다시 시도하세요.',
          },
        });
      }
    }

    expect(codes.slice(0, GLOBAL_MAX).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});

describe('Stripe 웹훅은 전역 제한에서 제외된다', () => {
  it('한도를 훨씬 넘겨도 429 가 나오지 않는다', async () => {
    const body = JSON.stringify({
      id: 'evt_rl',
      type: 'charge.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: { object: {} },
    });
    const signature = createHmac('sha256', 'whsec_test_secret').update(body).digest('hex');

    const codes: number[] = [];
    for (let i = 0; i < GLOBAL_MAX * 4; i += 1) {
      const res = await h.app.inject({
        method: 'POST',
        url: '/billing/webhook',
        headers: { 'content-type': 'application/json', 'stripe-signature': signature },
        payload: body,
      });
      codes.push(res.statusCode);
    }

    // Stripe 는 2xx 가 아니면 재시도를 쌓으므로, 몰려와도 429 가 나오면 안 된다.
    expect(codes.every((c) => c === 200)).toBe(true);
  });
});
