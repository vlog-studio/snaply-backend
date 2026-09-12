import { movieHref } from '@/shared/routes';

import { notificationTarget, SnapLibraryHref } from './notification-target';

describe('notificationTarget', () => {
  it.each([
    ['a server 완성 알림', { kind: 'movie_ready', movieId: 'm1', videoId: 'v1' }],
    ['a local failure notice', { kind: 'movie_failed', movieId: 'm1' }],
  ])('opens the movie %s names', (_case, data) => {
    expect(notificationTarget(data)).toEqual(movieHref('m1'));
  });

  // An expiry notice that lands anywhere else has not told the user anything
  // they can act on (SNAP-13).
  it('opens the library for an expiry notice', () => {
    expect(notificationTarget({ kind: 'snap_expiry', daysBefore: '3' })).toEqual(SnapLibraryHref);
  });

  it.each([
    ['no data at all', undefined],
    ['a string', 'movie_ready'],
    ['a kind this build does not know', { kind: 'location_arrival' }],
    ['a movie kind with no movie id', { kind: 'movie_ready' }],
    ['a movie kind with a blank movie id', { kind: 'movie_ready', movieId: '' }],
    ['an older payload without a kind', { movieId: 'm1', outcome: 'ready' }],
  ])('goes nowhere for %s, so the tap only opens the app', (_case, data) => {
    expect(notificationTarget(data)).toBeUndefined();
  });
});
