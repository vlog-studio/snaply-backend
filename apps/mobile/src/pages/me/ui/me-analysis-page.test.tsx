import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MeAnalysisPage } from './me-analysis-page';

jest.mock('@/shared/lib/secure-storage', () => ({
  secureStorage: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
  },
}));

// The consent slice is isolated at its Public API; its own hooks are tested
// there. The sheet stays real — which words the user agrees to is the point.
const mockConsent = jest.fn();
const mockGive = jest.fn();
const mockWithdraw = jest.fn();
jest.mock('@/features/analysis-consent', () => ({
  ...jest.requireActual('@/features/analysis-consent'),
  useAnalysisConsent: () => mockConsent(),
  useAnalysisConsentActions: () => ({
    give: mockGive,
    withdraw: mockWithdraw,
    pending: null,
    error: null,
  }),
}));

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

function renderPage() {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <MeAnalysisPage />
    </SafeAreaProvider>,
  );
}

const switchLabel = '\uC2A4\uB0C5 \uBD84\uC11D'; // 스냅 분석
const acceptLabel = '\uC2A4\uB0C5 \uBD84\uC11D \uCF1C\uAE30'; // 스냅 분석 켜기
const declineLabel = '\uC2A4\uB0C5 \uBD84\uC11D \uC548 \uCF1C\uAE30'; // 스냅 분석 안 켜기

const off = { available: true, granted: false, grantedAt: null, isLoaded: true };
const on = {
  available: true,
  granted: true,
  grantedAt: new Date('2026-09-29T01:00:00.000Z'),
  isLoaded: true,
};

describe('MeAnalysisPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGive.mockResolvedValue(true);
    mockWithdraw.mockResolvedValue(true);
  });

  it('asks with the full wording before recording anything', async () => {
    mockConsent.mockReturnValue(off);
    await renderPage();

    await fireEvent(screen.getByLabelText(switchLabel), 'valueChange', true);

    expect(
      screen.getByText(new RegExp('\uC815\uC9C0 \uC774\uBBF8\uC9C0\uB97C 4\uC7A5\uAE4C\uC9C0')),
    ).toBeTruthy(); // 정지 이미지를 4장까지
    expect(mockGive).not.toHaveBeenCalled();

    await fireEvent.press(screen.getByRole('button', { name: acceptLabel }));
    expect(mockGive).toHaveBeenCalledTimes(1);
  });

  it('records nothing when the wording is declined', async () => {
    mockConsent.mockReturnValue(off);
    await renderPage();

    await fireEvent(screen.getByLabelText(switchLabel), 'valueChange', true);
    await fireEvent.press(screen.getByRole('button', { name: declineLabel }));

    expect(mockGive).not.toHaveBeenCalled();
  });

  it('withdraws as soon as the switch goes off', async () => {
    mockConsent.mockReturnValue(on);
    await renderPage();

    await fireEvent(screen.getByLabelText(switchLabel), 'valueChange', false);

    expect(mockWithdraw).toHaveBeenCalledTimes(1);
  });

  // Turning it off destroys the analyses, so the cost is on the row before the
  // user flips it.
  it('says when it was turned on and what turning it off costs', async () => {
    mockConsent.mockReturnValue(on);
    await renderPage();

    expect(screen.getByText(new RegExp('\uCF30\uC5B4\uC694'))).toBeTruthy(); // 켰어요
    expect(
      screen.getByText(
        new RegExp('\uB044\uBA74 \uBD84\uC11D \uACB0\uACFC\uB97C \uC9C0\uC6CC\uC694'),
      ),
    ).toBeTruthy(); // 끄면 분석 결과를 지워요
  });

  it('cannot be switched on while the server has nothing to turn on', async () => {
    mockConsent.mockReturnValue({ ...off, available: false });
    await renderPage();

    expect(screen.getByLabelText(switchLabel).props.disabled).toBe(true);
  });
});
