import { fireEvent, render, screen } from '@testing-library/react-native';
import { type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { VideoPreview } from '@/shared/ui/video-preview';

import { VideoPlayerModal } from './video-player-modal';

// The player checks out one of the platform's few hardware decoders, so whether
// it is mounted at all is part of this component's contract. Standing in for it
// is what makes that assertable, and keeps expo-video out of the test.
jest.mock('@/shared/ui/video-preview', () => ({
  VideoPreview: jest.fn(() => null),
}));

const videoPreviewMock = jest.mocked(VideoPreview);

// useSafeAreaInsets needs a provider; seed fixed metrics so insets resolve
// synchronously in tests.
const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

const closeLabel = '\uCEF7 \uC7AC\uC0DD \uB2EB\uAE30'; // 'cut playback close'
const edgeLabel = '2026-07-28';
const caption = '3\uCD08 \u00B7 \uC6D0\uBCF8 \uCEF7'; // '3s . original cut'
const uri = 'file:///doc/recordings/snaply-1.mp4';

function withSafeArea(node: ReactNode) {
  return <SafeAreaProvider initialMetrics={metrics}>{node}</SafeAreaProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('VideoPlayerModal', () => {
  it('plays the given video under its edge print and caption', async () => {
    await render(
      withSafeArea(
        <VideoPlayerModal
          uri={uri}
          onClose={jest.fn()}
          closeLabel={closeLabel}
          edgeLabel={edgeLabel}
          caption={caption}
        />,
      ),
    );

    expect(videoPreviewMock).toHaveBeenCalledWith(expect.objectContaining({ uri }), undefined);
    expect(screen.getByText(edgeLabel)).toBeTruthy();
    expect(screen.getByText(caption)).toBeTruthy();
  });

  it('calls onClose when the close control is pressed', async () => {
    const onClose = jest.fn();
    await render(
      withSafeArea(<VideoPlayerModal uri={uri} onClose={onClose} closeLabel={closeLabel} />),
    );

    fireEvent.press(screen.getByRole('button', { name: closeLabel }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mounts no player and no overlay without a video', async () => {
    await render(
      withSafeArea(
        <VideoPlayerModal
          uri={undefined}
          onClose={jest.fn()}
          closeLabel={closeLabel}
          edgeLabel={edgeLabel}
          caption={caption}
        />,
      ),
    );

    expect(videoPreviewMock).not.toHaveBeenCalled();
    expect(screen.queryByText(edgeLabel)).toBeNull();
  });
});
