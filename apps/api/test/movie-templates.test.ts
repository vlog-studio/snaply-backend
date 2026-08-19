/**
 * 무비 템플릿 카탈로그 API.
 *
 * 이 계약이 지키는 것은 두 가지다.
 *   ① 앱이 서버 카탈로그와 내장 폴백 카탈로그 사이를 오가도 같은 템플릿을 가리킨다 (id·슬롯 id)
 *   ② 점수화 내부값(`matchHints`)이 응답으로 새지 않는다 — 새면 가중치 조정이 앱 릴리스에 묶인다
 *
 * 결정: docs/decisions/template-snap-recommendation.md
 *
 * 카탈로그 행은 마이그레이션이 넣고 하네스의 TRUNCATE 대상이 아니다. 그래서 이 파일이 행을
 * 건드릴 때는 반드시 원복한다 — 다음 테스트 파일이 같은 DB 를 그대로 물려받는다.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHarness, type Harness, type TestUser } from './helpers/harness.js';

let h: Harness;

beforeAll(async () => {
  h = await createHarness();
});
afterAll(async () => {
  await h.close();
});

function getCatalog(user: TestUser) {
  return h.app.inject({
    method: 'GET',
    url: '/movie-templates',
    headers: user.auth,
  });
}

describe('GET /movie-templates', () => {
  it('인증 없이는 401 이다', async () => {
    const res = await h.app.inject({ method: 'GET', url: '/movie-templates' });
    expect(res.statusCode).toBe(401);
  });

  it('마이그레이션이 넣은 4개를 정렬 순서대로 준다', async () => {
    const user = await h.createUser();

    const res = await getCatalog(user);

    expect(res.statusCode).toBe(200);
    const { templates } = res.json().data;
    // 앱의 내장 폴백 카탈로그와 같은 id·같은 순서여야 한다.
    expect(templates.map((t: { id: string }) => t.id)).toEqual(['walk', 'day', 'cafe', 'trip']);
  });

  it('각 템플릿이 편집 프리셋과 슬롯을 촬영 순서대로 들고 있다', async () => {
    const user = await h.createUser();

    const { templates } = (await getCatalog(user)).json().data;
    const walk = templates.find((t: { id: string }) => t.id === 'walk');

    expect(walk).toMatchObject({ name: '동네 산책', style: '감성', bgm: 'lofi-walk' });
    expect(walk.slots.map((s: { id: string }) => s.id)).toEqual([
      'start',
      'alley',
      'shop',
      'hero',
      'view',
      'back',
    ]);
    expect(walk.slots[1]).toEqual({ id: 'alley', label: '골목', hint: '좁은 길, 걷는 발' });
  });

  it('style 은 POST /edit-jobs 가 받는 프리셋 이름 그대로다', async () => {
    const user = await h.createUser();

    const { templates } = (await getCatalog(user)).json().data;

    // 앱이 자기 표기(emotional/travel/daily)로 변환하는 쪽이다. 서버가 원천을 쥔다.
    for (const template of templates) {
      expect(['감성', '여행', '일상']).toContain(template.style);
    }
  });

  it('점수화 내부값(matchHints)을 응답에 담지 않는다', async () => {
    const user = await h.createUser();

    const res = await getCatalog(user);

    // 직렬화 스키마가 걸러 주지만, 그 스키마가 느슨해지는 순간을 잡는 것이 이 테스트의 목적이다.
    expect(res.body).not.toContain('matchHints');
    expect(res.body).not.toContain('temporalPrior');
    const { templates } = res.json().data;
    for (const slot of templates.flatMap((t: { slots: unknown[] }) => t.slots)) {
      expect(Object.keys(slot as object).sort()).toEqual(['hint', 'id', 'label']);
    }
  });

  it('내린 템플릿은 목록에서 빠진다', async () => {
    const user = await h.createUser();

    await h.prisma.movieTemplate.update({
      where: { id: 'cafe' },
      data: { retiredAt: new Date() },
    });
    try {
      const { templates } = (await getCatalog(user)).json().data;
      expect(templates.map((t: { id: string }) => t.id)).toEqual(['walk', 'day', 'trip']);
    } finally {
      await h.prisma.movieTemplate.update({ where: { id: 'cafe' }, data: { retiredAt: null } });
    }
  });

  it('updatedAt 은 목록에서 가장 최근에 바뀐 템플릿의 시각이다', async () => {
    const user = await h.createUser();
    const before = (await getCatalog(user)).json().data.updatedAt;

    // 한 템플릿의 문구만 고쳐도 앱 캐시가 갱신돼야 한다.
    const touched = await h.prisma.movieTemplate.update({
      where: { id: 'day' },
      data: { description: '오늘 하루를 네 장면으로 ' },
    });
    try {
      const after = (await getCatalog(user)).json().data.updatedAt;
      expect(new Date(after).getTime()).toBeGreaterThan(new Date(before).getTime());
      expect(after).toBe(touched.updatedAt.toISOString());
    } finally {
      await h.prisma.movieTemplate.update({
        where: { id: 'day' },
        data: { description: '오늘 하루를 네 장면으로' },
      });
    }
  });
});
