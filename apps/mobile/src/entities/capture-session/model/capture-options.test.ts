import { normalizeCaptureDuration } from './capture-options';

describe('capture options', () => {
  describe('normalizeCaptureDuration', () => {
    it('keeps the supported five-second duration', () => {
      expect(normalizeCaptureDuration('5')).toBe(5);
    });

    it.each([undefined, '', '3', '4', '05'])(
      'falls back to three seconds for any other value: %s',
      (value) => {
        expect(normalizeCaptureDuration(value)).toBe(3);
      },
    );
  });
});
