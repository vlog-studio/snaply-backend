import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { instagramWebhookVerifyToken, instagramAppSecret } from '../services/sns.service.js';

interface VerifyQuery {
  'hub.mode'?: string;
  'hub.verify_token'?: string;
  'hub.challenge'?: string;
}

/**
 * 인스타그램 웹훅.
 *
 * 릴스 게시(우리가 쓰는 기능)에는 웹훅이 필요 없다. 하지만 Meta 콘솔의
 * "메시지 및 콘텐츠 관리" 사용 사례 설정에서 웹훅 등록을 요구하는 경우가 있고,
 * 등록 시 Meta 가 `hub.challenge` 를 되돌려받아야 통과시킨다. 그 검증만 처리한다.
 *
 * 이벤트(POST)는 서명만 확인하고 200 으로 받아 넘긴다 — 구독한 필드가 없으면 사실상 오지 않는다.
 * 서명 검증에 raw body 가 필요하므로 파서를 이 스코프에만 등록한다.
 */
export async function snsWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => {
    done(null, body);
  });

  // GET — 등록 시 1회 호출되는 검증 핸드셰이크
  app.get<{ Querystring: VerifyQuery }>(
    '/sns/instagram/webhook',
    { schema: { tags: ['sns'], summary: '인스타그램 웹훅 검증' } },
    async (request, reply) => {
      const expected = instagramWebhookVerifyToken();
      const mode = request.query['hub.mode'];
      const token = request.query['hub.verify_token'];
      const challenge = request.query['hub.challenge'] ?? '';

      if (!expected) {
        request.log.warn('INSTAGRAM_WEBHOOK_VERIFY_TOKEN 미설정 — 웹훅 검증을 거부합니다.');
        return reply.status(403).send();
      }
      if (mode !== 'subscribe' || token !== expected) {
        request.log.warn({ mode }, '인스타그램 웹훅 검증 실패 (mode/token 불일치)');
        return reply.status(403).send();
      }

      // Meta 는 challenge 를 그대로(평문) 되돌려받기를 기대한다.
      return reply.type('text/plain').send(challenge);
    },
  );

  // POST — 이벤트 수신. 서명 확인 후 200. (현재 처리하는 이벤트는 없다)
  app.post(
    '/sns/instagram/webhook',
    { schema: { tags: ['sns'], summary: '인스타그램 웹훅 수신' } },
    async (request, reply) => {
      const secret = instagramAppSecret();
      const header = request.headers['x-hub-signature-256'];
      const signature = Array.isArray(header) ? header[0] : header;
      const rawBody = request.body as Buffer;

      if (secret && signature?.startsWith('sha256=')) {
        const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
          request.log.warn('인스타그램 웹훅 서명 검증 실패');
          return reply.status(401).send();
        }
      }

      request.log.info({ bytes: rawBody?.length ?? 0 }, '인스타그램 웹훅 수신(미처리)');
      return reply.status(200).send({ received: true });
    },
  );
}
