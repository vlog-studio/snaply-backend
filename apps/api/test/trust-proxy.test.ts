/**
 * 앞단 프록시(ALB) 뒤에서의 클라이언트 IP — 전역 rate limit 이 사용자별로 갈리는지.
 *
 * 프록시를 믿지 않으면 모든 요청이 프록시 IP 하나로 보여 한도를 나눠 쓴다. `/health` 까지 429 가
 * 되면 ALB 가 대상을 빼 전체가 502 다. 반대로 프록시 없이 직접 받는 서버에서 X-Forwarded-For 를
 * 믿으면 클라이언트가 헤더를 바꿔 가며 한도를 피한다.
 *
 * inject 의 소켓 주소(127.0.0.1)가 ALB 자리다 — 그래서 여기서는 `loopback` 을 믿고, AWS 서버는
 * ALB 가 있는 사설 대역(`uniquelocal`)을 믿는다(docker-compose.aws.yml). ALB 는 클라이언트가 보낸
 * X-Forwarded-For 뒤에 자기가 본 주소를 덧붙이므로, 헤더의 맨 뒤 값이 실제 클라이언트다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness } from './helpers/harness.js';

const GLOBAL_MAX = 3;

async function hit(h: Harness, forwardedFor: string): Promise<number> {
  const res = await h.app.inject({
    method: 'GET',
    url: '/billing/products',
    headers: { 'x-forwarded-for': forwardedFor },
  });
  return res.statusCode;
}

describe('TRUST_PROXY — ALB 뒤', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness({ RATE_LIMIT_GLOBAL_MAX: String(GLOBAL_MAX), TRUST_PROXY: 'loopback' });
  });
  afterAll(async () => {
    await h.close();
  });

  it('ALB 가 덧붙인 클라이언트 IP 별로 한도를 따로 센다', async () => {
    for (let i = 0; i < GLOBAL_MAX; i += 1) {
      expect(await hit(h, '203.0.113.1')).toBe(200);
    }
    expect(await hit(h, '203.0.113.1')).toBe(429);
    // 같은 ALB 를 거친 다른 사용자는 앞 사용자의 한도에 묶이지 않는다.
    expect(await hit(h, '203.0.113.2')).toBe(200);
  });

  it('클라이언트가 X-Forwarded-For 앞쪽에 넣은 값은 믿지 않는다', async () => {
    for (let i = 0; i < GLOBAL_MAX; i += 1) {
      expect(await hit(h, '203.0.113.3')).toBe(200);
    }
    // 한도에 걸린 클라이언트가 다른 주소를 앞에 끼워 넣어도 ALB 가 덧붙인 실제 주소로 센다.
    expect(await hit(h, '198.51.100.7, 203.0.113.3')).toBe(429);
    // 다른 클라이언트가 한도에 걸린 주소를 사칭해도 그 한도를 함께 쓰지 않는다.
    expect(await hit(h, '203.0.113.3, 198.51.100.8')).toBe(200);
  });
});

describe('TRUST_PROXY 미설정 — 프록시 없이 직접 받는 서버', () => {
  let h: Harness;

  beforeAll(async () => {
    // 빈 값은 미설정이다(시크릿의 빈 키가 compose .env 로 옮겨 오면 이렇게 들어온다).
    h = await createHarness({ RATE_LIMIT_GLOBAL_MAX: String(GLOBAL_MAX), TRUST_PROXY: '' });
  });
  afterAll(async () => {
    await h.close();
  });

  it('X-Forwarded-For 를 바꿔 가며 보내도 한도를 피하지 못한다', async () => {
    const codes: number[] = [];
    for (let i = 0; i <= GLOBAL_MAX; i += 1) {
      codes.push(await hit(h, `203.0.113.${10 + i}`));
    }
    expect(codes.slice(0, GLOBAL_MAX).every((c) => c === 200)).toBe(true);
    expect(codes.at(-1)).toBe(429);
  });
});
