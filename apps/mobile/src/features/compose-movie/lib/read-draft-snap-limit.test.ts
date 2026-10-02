import { ApiError } from '@/shared/api';

import { readDraftSnapLimit } from './read-draft-snap-limit';

describe('readDraftSnapLimit', () => {
  it('reads the cap off the TOO_MANY_SNAPS details', () => {
    const error = new ApiError('TOO_MANY_SNAPS', 'too many', {
      status: 400,
      details: { max: 20 },
    });

    expect(readDraftSnapLimit(error)).toBe(20);
  });

  it.each([
    ['a non-ApiError', new Error('boom')],
    ['details missing entirely', new ApiError('TOO_MANY_SNAPS', 'x', { status: 400 })],
    [
      'a numeric string',
      new ApiError('TOO_MANY_SNAPS', 'x', { status: 400, details: { max: '20' } }),
    ],
    ['a fraction', new ApiError('TOO_MANY_SNAPS', 'x', { status: 400, details: { max: 2.5 } })],
    ['zero', new ApiError('TOO_MANY_SNAPS', 'x', { status: 400, details: { max: 0 } })],
  ])('returns undefined for %s', (_case, error) => {
    expect(readDraftSnapLimit(error)).toBeUndefined();
  });
});
