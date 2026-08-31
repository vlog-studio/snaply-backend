import type { MovieTemplate } from '../model/movie-template';

/**
 * The templates that ship with the build.
 *
 * **This is the fallback, not the catalog.** The catalog moved to the server on
 * 2026-08-19 (`GET /movie-templates`) so that a slot's matching rules and its
 * definition live on one row; these four rows are seeded there with the same
 * ids, labels, and hints. What is kept here answers instantly on a cold start,
 * offline, and when the endpoint is down — a template screen with no templates
 * is a dead end, and the build may as well carry four.
 *
 * Because the ids match the seed, the two never disagree about *which* template
 * a screen is showing. Read them through `useMovieTemplates`, which prefers the
 * server's answer; reach for this constant directly only to fall back.
 *
 * Four, deliberately. A template only earns its place if it describes an outing
 * a person actually has, and each one it does not is a card the user scrolls
 * past. They are ordered from the most ordinary day out to the most specific.
 *
 * The `style` each one asks for is one of the three backend presets (2026-08-07):
 * a walk and a cafe visit want 감성's soft transitions, a day summary wants
 * 일상's plain cuts, and an outing wants 여행's brighter, faster ones. Two
 * templates naming the same preset is fine — a template describes an outing, not
 * a look.
 */
export const MovieTemplateCatalog: readonly MovieTemplate[] = [
  {
    id: 'walk',
    name: '동네 산책',
    description: '걸으며 담은 여섯 장면',
    style: 'emotional',
    bgm: 'lofi-walk',
    slots: [
      { id: 'start', label: '출발', hint: '집 앞이나 지하철 출구' },
      { id: 'alley', label: '골목', hint: '좁은 길, 걷는 발' },
      { id: 'shop', label: '가게', hint: '간판이나 진열장' },
      { id: 'hero', label: '한 컷', hint: '오늘의 주인공' },
      { id: 'view', label: '풍경', hint: '멀리 보이는 것' },
      { id: 'back', label: '돌아오는 길', hint: '마무리' },
    ],
  },
  {
    id: 'day',
    name: '하루 요약',
    description: '오늘 하루를 네 장면으로',
    style: 'daily',
    bgm: 'morning-tape',
    slots: [
      { id: 'morning', label: '아침', hint: '하루를 여는 컷' },
      { id: 'noon', label: '낮', hint: '가장 오래 머문 곳' },
      { id: 'evening', label: '저녁', hint: '해 질 무렵' },
      { id: 'closing', label: '마무리', hint: '하루를 닫는 컷' },
    ],
  },
  {
    id: 'cafe',
    name: '카페 한 곳',
    description: '다녀온 카페를 소개하는 다섯 장면',
    style: 'emotional',
    bgm: 'sunny-side',
    slots: [
      { id: 'front', label: '외관', hint: '가게 앞' },
      { id: 'menu', label: '메뉴판', hint: '글씨가 보이게' },
      { id: 'drink', label: '음료', hint: '테이블 위 클로즈업' },
      { id: 'room', label: '공간', hint: '좌석과 조명' },
      { id: 'sip', label: '한 모금', hint: '마시는 손' },
    ],
  },
  {
    id: 'trip',
    name: '나들이',
    description: '멀리 다녀온 하루를 한 편으로',
    style: 'travel',
    bgm: 'sunny-side',
    slots: [
      { id: 'leave', label: '떠나는 길', hint: '차 안, 역, 버스 창' },
      { id: 'arrive', label: '도착', hint: '처음 본 장면' },
      { id: 'main', label: '오늘의 목적', hint: '보러 온 것' },
      { id: 'food', label: '먹은 것', hint: '한 그릇, 한 잔' },
      { id: 'wide', label: '넓게 한 번', hint: '어디였는지 알 수 있게' },
      { id: 'home', label: '돌아오는 길', hint: '마무리' },
    ],
  },
];
