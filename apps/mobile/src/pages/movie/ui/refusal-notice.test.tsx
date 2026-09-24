import { generationRefusalMessage } from './refusal-notice';

// 크레딧이 부족해요.
const creditShort = '\uD06C\uB808\uB527\uC774 \uBD80\uC871\uD574\uC694.';
// 크레딧이 부족해요 · 40/100.
const creditShortWithNumbers = '\uD06C\uB808\uB527\uC774 \uBD80\uC871\uD574\uC694 \u00B7 40/100.';
// " 나 탭 크레딧에서 광고를 보고 받을 수 있어요."
const adHint =
  ' \uB098 \uD0ED \uD06C\uB808\uB527\uC5D0\uC11C \uAD11\uACE0\uB97C \uBCF4\uACE0 \uBC1B\uC744 \uC218 \uC788\uC5B4\uC694.';

describe('generationRefusalMessage', () => {
  it('words a backend refusal itself instead of passing the server message through', () => {
    // 지금은 무비를 만들 수 없어요. 잠시 후 다시 시도해 주세요.
    expect(generationRefusalMessage('rejected')).toBe(
      '\uC9C0\uAE08\uC740 \uBB34\uBE44\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC5B4\uC694. \uC7A0\uC2DC \uD6C4 \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.',
    );
  });

  it.each([
    ['without numbers, ads closed', undefined, false, creditShort],
    ['without numbers, ads open', undefined, true, `${creditShort}${adHint}`],
    ['with numbers, ads closed', { balance: 40, required: 100 }, false, creditShortWithNumbers],
    [
      'with numbers, ads open',
      { balance: 40, required: 100 },
      true,
      `${creditShortWithNumbers}${adHint}`,
    ],
  ])('names the ad top-up only while ads are open (%s)', (_label, shortfall, adsEnabled, line) => {
    expect(generationRefusalMessage('no-credit', shortfall, adsEnabled)).toBe(line);
  });
});
