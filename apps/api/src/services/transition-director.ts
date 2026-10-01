import { validateTransition, type StylePreset, type Transition } from '@vlog-studio/shared-types';

/**
 * AI 가 경계마다 고르는 전환(specs/movie.md MOV-22).
 *
 * **지금은 스타일 기본값이다.** 경계별 전환이 들어오기 전에는 프리셋 하나가 모든 경계의 전환을
 * 정했고(ai-worker `pipeline/editor.py` 의 `PRESETS`), 기존 무비는 마이그레이션에서 그 값으로
 * 채워졌다. 같은 값을 고르면 경계별 저장으로 바뀐 뒤에도 사용자가 보는 결과가 그대로다.
 * 컷 쌍·촬영 시각을 보는 규칙은 다음 단계에서 이 함수 안에 들어온다 — 호출하는 쪽은 바뀌지 않는다.
 *
 * 입력에 컷 길이를 넣지 않는 것은 의도다. 트림은 전환을 다시 고르지 않는다(무효화 사전
 * `cut-trim`: `timeline.transitions` 는 `retimed`) — 짧아진 컷은 `resolveTransition` 의 폴백이 맡는다.
 */
const STYLE_DEFAULTS: Record<StylePreset, Transition> = {
  감성: validateTransition({ kind: 'crossfade', durationMs: 800 }),
  여행: { kind: 'hardcut' },
  일상: { kind: 'hardcut' },
};

export function pickTransition(params: { stylePreset: StylePreset }): Transition {
  return STYLE_DEFAULTS[params.stylePreset];
}
