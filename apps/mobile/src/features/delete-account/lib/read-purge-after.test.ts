import { ApiError } from '@/shared/api';

import { readPurgeAfter } from './read-purge-after';

function pendingDeletionError(details?: Record<string, unknown>): ApiError {
  return new ApiError('ACCOUNT_PENDING_DELETION', '삭제 대기 중인 계정입니다.', {
    status: 403,
    details,
  });
}

describe('readPurgeAfter', () => {
  it('reads the deadline the backend attached to the error', () => {
    const error = pendingDeletionError({ purgeAfter: '2026-09-11T08:00:00.000Z' });

    expect(readPurgeAfter(error)).toEqual(new Date('2026-09-11T08:00:00.000Z'));
  });

  it.each([
    ['no details at all', undefined],
    ['details without the field', { other: 'value' }],
    ['a non-string value', { purgeAfter: 1_757_577_600_000 }],
    ['an unparseable date', { purgeAfter: 'not-a-date' }],
  ])('returns undefined for %s', (_label, details) => {
    expect(readPurgeAfter(pendingDeletionError(details))).toBeUndefined();
  });

  it('returns undefined for anything that is not an ApiError', () => {
    expect(readPurgeAfter(new Error('boom'))).toBeUndefined();
    expect(readPurgeAfter(undefined)).toBeUndefined();
  });
});
