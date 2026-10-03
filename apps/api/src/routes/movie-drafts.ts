import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { MAX_DRAFT_SNAPS, ok, requestMovieDraft } from '@vlog-studio/shared-types';
import { DAILY_DRAFT_LIMIT, requestDraft } from '../services/movie-draft.service.js';

export async function movieDraftRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // POST /movie-drafts — 편집 초안 제안 (동기, 멱등)
  routes.post(
    requestMovieDraft.fastifyPath,
    {
      preHandler: app.authenticate,
      config: {
        // 유저(토큰)당 분당 10회. 비용 방어는 일일 한도가 하고, 이건 버스트만 막는다.
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
          keyGenerator: (req) => req.headers.authorization ?? req.ip,
        },
      },
      schema: {
        ...requestMovieDraft.schema,
        tags: ['movies'],
        summary: '넘긴 스냅으로 편집 초안 제안 받기',
        description: [
          '넘긴 스냅 중 쓸 것을 고르고(못 쓰는 것·중복은 뺀다), 촬영순으로 놓고, 컷마다 구간을 자른 **제안**을 돌려준다.',
          '**무비를 만들지 않는다** — 앱이 이 컷들로 무비를 만들고(`POST /movies`, `arranger: ai`, 컷마다',
          '`trimOwner: ai`) 업로드가 끝나면 지금처럼 보낸다. 전환은 그때 서버가 고른다.',
          '',
          '**업로드되지 않은 스냅도 넘긴다**(`localId` + `capturedAt`). 빼지 않고 촬영 시각 자리에 구간 없이 놓는다.',
          '업로드됐지만 신호가 아직 없는 스냅도 같다 — 서버가 신호 계산을 적재해 두고 다음 요청부터 쓴다.',
          '',
          '**기다리지 않는다.** 응답이 곧 결과다. 분석에 동의하지 않았거나 분석이 꺼져 있어도 초안은 나온다.',
          '',
          '**크레딧을 차감하지 않는다.** 비용은 상한으로 막는다 — 한 번에 스냅',
          `**${MAX_DRAFT_SNAPS}개**(넘으면 400 \`TOO_MANY_SNAPS\` + \`max\`), 최근 24시간 **${DAILY_DRAFT_LIMIT}번**`,
          '(넘으면 429 `DRAFT_LIMIT`). 같은 스타일 · 같은 스냅 집합이 24시간 안에 다시 오면 같은 제안을 돌려주고',
          '횟수에 세지 않는다.',
          '',
          '`excluded` 는 넣지 않은 스냅이다. **이유는 주지 않는다** — 앱은 개수를 알리고 다시 넣을 수 있게 한다.',
          '',
          '`unavailable` 은 넘긴 자기 스냅 중 지워졌거나 준비되지 않아 서버가 쓸 수 없는 것이다. 나머지로 초안을 만들고, 모두',
          '그렇다면 `cuts` 가 비어 있다(기록하지 않고 횟수에 세지 않는다). 남의 스냅이 섞이면 어느 것인지 알리지 않고 403 이다.',
        ].join('\n'),
      },
    },
    async (request) => {
      const draft = await requestDraft({
        userId: request.user.id,
        ...(request.body.stylePreset !== undefined ? { stylePreset: request.body.stylePreset } : {}),
        snaps: request.body.snaps,
      });
      return ok(draft);
    },
  );
}
