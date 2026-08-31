import { act, renderHook } from '@testing-library/react-native';

import { useSetTabBarHidden, useTabBarChromeStore, useTabBarHidden } from './tab-bar-chrome';

describe('tab bar chrome store', () => {
  beforeEach(() => {
    // The store is a module-level singleton; reset it so tests stay independent.
    useTabBarChromeStore.setState({ hidden: false });
  });

  it('shows the bottom chrome by default', async () => {
    const { result } = await renderHook(() => useTabBarHidden());

    expect(result.current).toBe(false);
  });

  it('hides and restores the bottom chrome through the setter', async () => {
    const { result } = await renderHook(() => ({
      hidden: useTabBarHidden(),
      setHidden: useSetTabBarHidden(),
    }));

    await act(async () => {
      result.current.setHidden(true);
    });
    expect(result.current.hidden).toBe(true);

    await act(async () => {
      result.current.setHidden(false);
    });
    expect(result.current.hidden).toBe(false);
  });

  it('publishes the switch to every subscriber, which is what the navigator relies on', async () => {
    // The screen that flips the switch and the navigator that reads it never
    // share a tree, so a change made through one hook must be visible from the
    // other.
    const screen = await renderHook(() => useSetTabBarHidden());
    const navigator = await renderHook(() => useTabBarHidden());

    await act(async () => {
      screen.result.current(true);
    });

    expect(navigator.result.current).toBe(true);
  });
});
