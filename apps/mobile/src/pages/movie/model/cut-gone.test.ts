import type { SnapRef } from '@/entities/movie';

import { cutGone } from './cut-gone';

const ref = (fields: Partial<SnapRef> = {}): SnapRef => ({ snapId: 's1', order: 0, ...fields });

describe('cutGone', () => {
  it.each([
    // A snap deleted on another device is the user's act, not our retention —
    // it must not read as expired while that device's movie edit is on its way.
    [
      'deleted on the server, original here',
      ref({ unavailable: true, unavailableReason: 'user' }),
      true,
      'deleted',
    ],
    [
      'deleted on the server, original gone',
      ref({ unavailable: true, unavailableReason: 'user' }),
      false,
      'deleted',
    ],
    [
      'expired, original here',
      ref({ unavailable: true, unavailableReason: 'expired' }),
      true,
      'expired',
    ],
    [
      'expired, original gone',
      ref({ unavailable: true, unavailableReason: 'expired' }),
      false,
      'expired',
    ],
    ['unavailable without a reason', ref({ unavailable: true }), false, 'expired'],
    ['original deleted here only', ref(), false, 'deleted'],
    ['playable', ref(), true, undefined],
  ] as const)('%s', (_label, cut, hasSnap, expected) => {
    expect(cutGone(cut, hasSnap)).toBe(expected);
  });
});
