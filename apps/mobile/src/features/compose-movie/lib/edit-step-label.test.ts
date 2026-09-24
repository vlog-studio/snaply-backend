import { editStepLabel } from './edit-step-label';

describe('editStepLabel', () => {
  // Every step the worker publishes today (apps/ai-worker/src/worker.py).
  it.each([
    ['\uC2DC\uC791', '\uC900\uBE44\uD558\uB294 \uC911'], // 시작 → 준비하는 중
    ['\uC6D0\uBCF8 \uB2E4\uC6B4\uB85C\uB4DC \uC644\uB8CC', '\uCEF7 \uC790\uB974\uB294 \uC911'], // 원본 다운로드 완료 → 컷 자르는 중
    ['\uCEF7\uD3B8\uC9D1 \uC644\uB8CC', '\uC74C\uC545 \uACE0\uB974\uB294 \uC911'], // 컷편집 완료 → 음악 고르는 중
    ['\uC74C\uC545 \uB9E4\uCE6D \uC911...', '\uC74C\uC545 \uACE0\uB974\uB294 \uC911'], // 음악 매칭 중... → 음악 고르는 중
    ['\uC790\uB9C9 \uC0DD\uC131 \uC911...', '\uC790\uB9C9 \uB123\uB294 \uC911'], // 자막 생성 중... → 자막 넣는 중
    ['\uC790\uB9C9 \uAC74\uB108\uB700', '\uB9C8\uBB34\uB9AC\uD558\uB294 \uC911'], // 자막 건너뜀 → 마무리하는 중
    ['\uC5C5\uB85C\uB4DC \uC911...', '\uB9C8\uBB34\uB9AC\uD558\uB294 \uC911'], // 업로드 중... → 마무리하는 중
    ['\uC644\uB8CC', '\uB2E4 \uB410\uC5B4\uC694'], // 완료 → 다 됐어요
  ])('maps the worker step %s', (step, label) => {
    expect(editStepLabel(step)).toBe(label);
  });

  it('ignores how the step is decorated (a Unicode ellipsis, surrounding space)', () => {
    // 음악 매칭 중…
    expect(editStepLabel('  \uC74C\uC545 \uB9E4\uCE6D \uC911\u2026 ')).toBe(
      '\uC74C\uC545 \uACE0\uB974\uB294 \uC911', // 음악 고르는 중
    );
  });

  it.each([
    ['an unknown step', '\uCDE8\uC18C\uB428'], // 취소됨
    ['an English log line', 'rendering subtitles'],
  ])('never shows %s verbatim', (_label, step) => {
    expect(editStepLabel(step)).toBe('\uB9CC\uB4DC\uB294 \uC911'); // 만드는 중
  });

  it.each([
    ['no step yet', undefined],
    ['an empty step', '  '],
  ])('reads %s as waiting in line', (_label, step) => {
    expect(editStepLabel(step)).toBe('\uC21C\uC11C\uB97C \uAE30\uB2E4\uB9AC\uB294 \uC911'); // 순서를 기다리는 중
  });
});
