import { videoContentType } from './video-content-type';

describe('videoContentType', () => {
  it.each([
    ['file:///doc/recordings/snaply-1.mp4', 'video/mp4'],
    ['file:///doc/recordings/snaply-2.MOV', 'video/quicktime'],
    ['file:///doc/recordings/snaply-3.m4v', 'video/x-m4v'],
    ['file:///doc/recordings/snaply-4.webm', 'video/webm'],
  ])('maps %s to %s', (uri, expected) => {
    expect(videoContentType(uri)).toBe(expected);
  });

  it.each([['file:///doc/recordings/no-extension'], ['file:///doc/recordings/snaply.unknown9x']])(
    'falls back to video/mp4 for %s',
    (uri) => {
      expect(videoContentType(uri)).toBe('video/mp4');
    },
  );
});
