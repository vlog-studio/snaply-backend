import { ApiError } from '@/shared/api';

import { readCreditShortfall } from './read-credit-shortfall';

describe('readCreditShortfall', () => {
  it('reads required and balance off the 402 details', () => {
    const error = new ApiError('INSUFFICIENT_CREDITS', '크레딧이 부족합니다', {
      status: 402,
      details: { required: 100, balance: 40 },
    });

    expect(readCreditShortfall(error)).toEqual({ required: 100, balance: 40 });
  });

  it.each([
    ['a non-ApiError', new Error('boom')],
    ['details missing entirely', new ApiError('INSUFFICIENT_CREDITS', 'x', { status: 402 })],
    [
      'non-numeric fields',
      new ApiError('INSUFFICIENT_CREDITS', 'x', {
        status: 402,
        details: { required: '100', balance: 40 },
      }),
    ],
  ])('returns undefined for %s', (_case, error) => {
    expect(readCreditShortfall(error)).toBeUndefined();
  });
});
