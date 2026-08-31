import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';

import { useReducedMotion } from './use-reduced-motion';

const mockRemove = jest.fn();
let changeListener: ((enabled: boolean) => void) | undefined;

beforeEach(() => {
  changeListener = undefined;
  mockRemove.mockClear();
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation(((
    event: string,
    listener: (enabled: boolean) => void,
  ) => {
    if (event === 'reduceMotionChanged') changeListener = listener;
    return { remove: mockRemove };
  }) as never);
});

describe('useReducedMotion', () => {
  it('resolves the initial reduce-motion setting', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);

    const { result } = await renderHook(() => useReducedMotion());

    await waitFor(() => expect(result.current).toBe(true));
  });

  it('updates when the setting changes', async () => {
    const { result } = await renderHook(() => useReducedMotion());
    await waitFor(() => expect(result.current).toBe(false));

    await act(async () => changeListener?.(true));

    expect(result.current).toBe(true);
  });

  it('removes the subscription on unmount', async () => {
    const { unmount } = await renderHook(() => useReducedMotion());
    await waitFor(() => expect(changeListener).toBeDefined());

    unmount();

    await waitFor(() => expect(mockRemove).toHaveBeenCalledTimes(1));
  });
});
