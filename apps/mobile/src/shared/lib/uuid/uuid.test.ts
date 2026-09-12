import { isUuid, randomUuid } from './uuid';

describe('randomUuid', () => {
  // The backend validates movie ids with `z.uuid()`; an id that fails it would
  // be refused at the first sync and the movie could never leave the device.
  it('mints ids the backend accepts as uuids', () => {
    for (let i = 0; i < 20; i += 1) expect(isUuid(randomUuid())).toBe(true);
  });

  it('does not repeat itself', () => {
    const ids = new Set(Array.from({ length: 200 }, () => randomUuid()));
    expect(ids.size).toBe(200);
  });
});

describe('isUuid', () => {
  it.each([
    ['a v4 uuid', '2f1c7a2e-5c1b-4d7e-9f0a-1b2c3d4e5f60', true],
    ['the old local movie id shape', 'movie-1753200000000', false],
    ['a video id used as a placeholder', 'v1', false],
  ])('recognizes %s', (_case, value, expected) => {
    expect(isUuid(value)).toBe(expected);
  });
});
