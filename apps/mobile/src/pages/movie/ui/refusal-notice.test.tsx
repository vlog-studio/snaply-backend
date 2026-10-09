import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  generationRefusalMessage,
  OpenGeneratingMovieLabel,
  RefusalNotice,
} from './refusal-notice';

// 크레딧이 부족해요.
const creditShort = '\uD06C\uB808\uB527\uC774 \uBD80\uC871\uD574\uC694.';
// 크레딧이 부족해요 · 40/100.
const creditShortWithNumbers = '\uD06C\uB808\uB527\uC774 \uBD80\uC871\uD574\uC694 \u00B7 40/100.';
// 다른 무비를 만드는 중이에요. 다 만들어지거나 취소하면 만들 수 있어요.
const busyLine =
  '\uB2E4\uB978 \uBB34\uBE44\uB97C \uB9CC\uB4DC\uB294 \uC911\uC774\uC5D0\uC694. \uB2E4 \uB9CC\uB4E4\uC5B4\uC9C0\uAC70\uB098 \uCDE8\uC18C\uD558\uBA74 \uB9CC\uB4E4 \uC218 \uC788\uC5B4\uC694.';
// 만드는 중인 무비 보기
const openRunningLabel = '\uB9CC\uB4DC\uB294 \uC911\uC778 \uBB34\uBE44 \uBCF4\uAE30';
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

  // MOV-11: an account makes one movie at a time. The line says both ways out —
  // the other run ending, or the user canceling it.
  it('says another movie is being made and that this one can run once it ends', () => {
    expect(generationRefusalMessage('busy')).toBe(busyLine);
  });
});

describe('RefusalNotice', () => {
  it('offers the busy refusal\u2019s way to the running movie as a button', async () => {
    const onPress = jest.fn();
    await render(
      <RefusalNotice message={busyLine} action={{ label: OpenGeneratingMovieLabel, onPress }} />,
    );

    expect(screen.getByText(busyLine)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: openRunningLabel }));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('offers nothing to press when the refusal has no way out of its own', async () => {
    await render(<RefusalNotice message={busyLine} />);

    expect(screen.queryByRole('button')).toBeNull();
  });
});
