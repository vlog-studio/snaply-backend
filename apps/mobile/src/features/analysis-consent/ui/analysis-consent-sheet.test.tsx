import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnalysisConsentSheet } from './analysis-consent-sheet';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function withSafeArea(node: ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>;
}

const acceptLabel = '\uC2A4\uB0C5 \uBD84\uC11D \uCF1C\uAE30'; // 스냅 분석 켜기
const declineLabel = '\uC2A4\uB0C5 \uBD84\uC11D \uC548 \uCF1C\uAE30'; // 스냅 분석 안 켜기

describe('AnalysisConsentSheet', () => {
  // The yes this sheet collects is to these words, so each fact the server's
  // behavior and the privacy policy rest on has to be on it (specs ANA-5). Change
  // one and the consent version changes with it (`AnalysisConsentVersion`).
  it.each([
    ['what is sent', '\uC815\uC9C0 \uC774\uBBF8\uC9C0\uB97C 4\uC7A5\uAE4C\uC9C0'], // 정지 이미지를 4장까지
    ['where it goes', 'OpenAI(\uBBF8\uAD6D)'], // OpenAI(미국)
    ['what is not sent', '\uC18C\uB9AC\uB294 \uBCF4\uB0B4\uC9C0 \uC54A\uC544\uC694'], // 소리는 보내지 않아요
    [
      'what it is used for',
      '\uC5B4\uB290 \uCEF7\uC5D0 \uB123\uC744\uC9C0 \uACE0\uB974\uB294 \uB370\uB9CC',
    ], // 어느 컷에 넣을지 고르는 데만
    ['that it is not trained on', '\uD559\uC2B5\uC5D0 \uC4F0\uC9C0 \uC54A\uACE0'], // 학습에 쓰지 않고
    ['how long the provider keeps it', '\uCD5C\uB300 30\uC77C'], // 최대 30일
    [
      'how to take it back',
      '\uB098 \uD0ED\uC5D0\uC11C \uC5B8\uC81C\uB4E0 \uB04C \uC218 \uC788\uACE0',
    ], // 나 탭에서 언제든 끌 수 있고
    [
      'what withdrawing destroys',
      '\uB044\uBA74 \uBD84\uC11D \uACB0\uACFC\uB97C \uC9C0\uC6CC\uC694',
    ], // 끄면 분석 결과를 지워요
    [
      'that saying no costs nothing',
      '\uCF1C\uC9C0 \uC54A\uC544\uB3C4 \uD15C\uD50C\uB9BF\uC740 \uADF8\uB300\uB85C',
    ], // 켜지 않아도 템플릿은 그대로
  ])('states %s', async (_fact, text) => {
    await render(
      withSafeArea(<AnalysisConsentSheet visible onAccept={jest.fn()} onDecline={jest.fn()} />),
    );

    expect(screen.getByText(new RegExp(text.replace(/[()]/g, '\\$&')))).toBeTruthy();
  });

  it('records a yes only through its own accept button', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    await render(
      withSafeArea(<AnalysisConsentSheet visible onAccept={onAccept} onDecline={onDecline} />),
    );

    await fireEvent.press(screen.getByRole('button', { name: declineLabel }));
    expect(onDecline).toHaveBeenCalledTimes(1);
    expect(onAccept).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: acceptLabel }));
    expect(onAccept).toHaveBeenCalledTimes(1);
  });

  it('holds both answers while a yes is being recorded', async () => {
    const onAccept = jest.fn();
    const onDecline = jest.fn();
    await render(
      withSafeArea(
        <AnalysisConsentSheet visible pending onAccept={onAccept} onDecline={onDecline} />,
      ),
    );

    await fireEvent.press(screen.getByRole('button', { name: acceptLabel }));
    await fireEvent.press(screen.getByRole('button', { name: declineLabel }));

    expect(onAccept).not.toHaveBeenCalled();
    expect(onDecline).not.toHaveBeenCalled();
    expect(screen.getByText('\uCF1C\uB294 \uC911\u2026')).toBeTruthy(); // 켜는 중…
  });

  it('says why the last yes did not take', async () => {
    await render(
      withSafeArea(
        <AnalysisConsentSheet
          visible
          error={
            '\uC2A4\uB0C5 \uBD84\uC11D\uC744 \uCF1C\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.'
          }
          onAccept={jest.fn()}
          onDecline={jest.fn()}
        />,
      ),
    );

    expect(
      screen.getByText(
        '\uC2A4\uB0C5 \uBD84\uC11D\uC744 \uCF1C\uC9C0 \uBABB\uD588\uC5B4\uC694. \uB2E4\uC2DC \uC2DC\uB3C4\uD574 \uC8FC\uC138\uC694.',
      ),
    ).toBeTruthy();
  });
});
