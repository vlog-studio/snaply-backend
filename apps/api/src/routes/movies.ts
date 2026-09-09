import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  MOVIE_LIST_DEFAULT_LIMIT,
  createMovie as createMovieRoute,
  deleteMovie as deleteMovieRoute,
  exportMovie as exportMovieRoute,
  finishMovie as finishMovieRoute,
  getMovie as getMovieRoute,
  listMovies as listMoviesRoute,
  ok,
  updateMovie as updateMovieRoute,
} from '@vlog-studio/shared-types';
import {
  createMovie,
  deleteMovie,
  exportMovie,
  finishMovie,
  getMovie,
  listMovies,
  updateMovie,
} from '../services/movie.service.js';

const WHAT_A_MOVIE_IS = [
  '무비는 **스냅을 참조하는 편집 레시피**다. 스냅을 소유하지 않으므로 한 스냅을 여러 무비가',
  '서로 다른 구간으로 쓸 수 있고, 무비를 지워도 스냅은 남는다.',
].join('\n');

export async function movieRoutes(app: FastifyInstance): Promise<void> {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  // POST /movies — 무비 생성
  routes.post(
    createMovieRoute.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...createMovieRoute.schema,
        tags: ['movies'],
        summary: '무비 생성',
        description: [
          WHAT_A_MOVIE_IS,
          '',
          '컷 없이 만들면 빈 초안이 되고, 나중에 `PATCH /movies/{id}` 로 채운다.',
          '',
          '**컷 순서**: 보낸 배열 순서가 곧 재생 순서다. 단 `arranger: "ai"` 로 만들면 서버가',
          '촬영 시각 순으로 정렬한다 — 템플릿 추천처럼 서버가 고른 조합에 쓴다. 사용자가 순서를',
          '직접 잡는 무비는 `user`(기본값)로 두어야 서버가 다시 정렬하지 않는다.',
          '',
          '내 소유가 아니거나 삭제된 스냅이 섞여 있으면 403.',
        ].join('\n'),
      },
    },
    async (request, reply) => {
      const data = await createMovie({ userId: request.user.id, ...request.body });
      reply.status(201);
      return ok(data);
    },
  );

  // GET /movies — 내 무비 목록
  routes.get(
    listMoviesRoute.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...listMoviesRoute.schema,
        tags: ['movies'],
        summary: '내 무비 목록',
        description: [
          '**최근 편집한 순서**로 준다 — 스튜디오 보드가 그 순서로 그린다.',
          '삭제한 무비는 제외된다. 커서 페이지네이션은 영상 목록과 같은 방식이다.',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await listMovies({
        userId: request.user.id,
        status: request.query.status,
        cursor: request.query.cursor,
        limit: request.query.limit ?? MOVIE_LIST_DEFAULT_LIMIT,
      });
      return ok(data);
    },
  );

  // GET /movies/:id — 무비 상세
  routes.get(
    getMovieRoute.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...getMovieRoute.schema,
        tags: ['movies'],
        summary: '무비 상세',
        description: [
          '컷 목록은 **재생 순서대로** 온다.',
          '',
          '컷의 `unavailable: true` 는 **참조하던 스냅이 사라졌다**는 뜻이다(만료 또는 삭제).',
          '그런 컷이 있어도 무비 자체는 열려야 하므로 컷을 빼지 않고 표시만 한다 — 사용자가',
          '무엇을 잃었는지 알 수 있어야 하기 때문이다. 다만 그 상태로는 생성할 수 없다.',
          '',
          '남의 무비는 403 이 아니라 404 다(존재 여부를 노출하지 않는다).',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await getMovie({ userId: request.user.id, movieId: request.params.id });
      return ok(data);
    },
  );

  // PATCH /movies/:id — 무비 수정
  routes.patch(
    updateMovieRoute.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...updateMovieRoute.schema,
        tags: ['movies'],
        summary: '무비 수정',
        description: [
          '보낸 필드만 바꾼다. **`clips` 를 보내면 컷 목록을 통째로 교체한다** — 부분 수정이 아니다.',
          '',
          '생성 중(`generating`)인 무비는 **409** 로 거부한다. 진행 중인 작업이 더 이상 존재하지',
          '않는 컷 목록을 설명하게 되기 때문이다.',
          '',
          '**끝낸 무비도 수정할 수 있다** — 사라지는 것은 결과물 파일이지 무비가 아니다.',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await updateMovie({
        userId: request.user.id,
        movieId: request.params.id,
        ...request.body,
      });
      return ok(data);
    },
  );

  // DELETE /movies/:id — 무비 삭제
  routes.delete(
    deleteMovieRoute.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...deleteMovieRoute.schema,
        tags: ['movies'],
        summary: '무비 삭제',
        description: [
          '무비를 지운다. **참조하던 스냅은 지우지 않는다** — 한 스냅을 여러 무비가 나눠 쓸 수',
          '있어서, 함께 지우면 다른 무비의 컷이 사라진다.',
        ].join('\n'),
      },
    },
    async (request) => {
      await deleteMovie({ userId: request.user.id, movieId: request.params.id });
      return ok({ deleted: true as const });
    },
  );

  // POST /movies/:id/export — 생성(내보내기)
  routes.post(
    exportMovieRoute.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...exportMovieRoute.schema,
        tags: ['movies'],
        summary: '무비 생성(내보내기)',
        description: [
          '무비의 컷 구성으로 편집 작업을 시작한다. **비동기** — 즉시 `202` 와 `jobId` 만 준다.',
          '진행률은 `GET /edit-jobs/{id}` 또는 WebSocket 으로 본다.',
          '',
          '`POST /edit-jobs` 를 직접 부르는 것과 같은 엔진을 쓴다. 다른 점은 클립 목록을',
          '**서버가 무비에서 꺼내 온다**는 것뿐이다.',
          '',
          '- 크레딧 **100** 을 예약한다. 잔액이 모자라면 402',
          '- 이미 생성 중이면 409',
          '- 사라진 스냅(`unavailable`)이 섞여 있으면 400 — 빼고 다시 시도한다',
          '- **다시 만들면 이전 결과물을 대신한다**(누적하지 않는다)',
        ].join('\n'),
      },
    },
    async (request, reply) => {
      const data = await exportMovie({ userId: request.user.id, movieId: request.params.id });
      reply.status(202);
      return ok(data);
    },
  );

  // POST /movies/:id/finish — 끝내기
  routes.post(
    finishMovieRoute.fastifyPath,
    {
      preHandler: app.authenticate,
      schema: {
        ...finishMovieRoute.schema,
        tags: ['movies'],
        summary: '끝내기 — 결과물을 가져갔음을 확정하고 서버 파일을 지운다',
        description: [
          '사용자가 결과물을 다운로드했거나 SNS 에 게시했을 때 호출한다. 서버의 결과물 파일을',
          '지우고, **무비는 남긴다** — 끝낸 뒤에도 고쳐서 다시 만들 수 있다(새 생성이므로 크레딧',
          '100 을 다시 낸다).',
          '',
          '⚠️ **이 호출은 추측으로 하면 안 된다.** 시스템 공유 시트는 사용자가 실제로 저장했는지',
          '알려주지 않으므로(시트를 닫기만 해도 성공과 구분되지 않는다), 다운로드 경로에서는',
          '**사용자의 명시적 행동**이어야 한다. SNS 게시는 서버가 성공을 알고 있으므로 안전하다.',
          '',
          '되돌릴 수 없다 — 지운 결과물 파일은 복구되지 않는다.',
        ].join('\n'),
      },
    },
    async (request) => {
      const data = await finishMovie({ userId: request.user.id, movieId: request.params.id });
      return ok(data);
    },
  );
}
