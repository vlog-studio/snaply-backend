import { balanceReadOut } from './balance-read-out';

const price = '보유 크레딧 · 무비 1편 = 100'; // 보유 크레딧 · 무비 1편 = 100

/** 보유 크레딧 · 무비 N편을 만들 수 있어요 */
function movies(count: number): string {
  return `보유 크레딧 · 무비 ${count}편을 만들 수 있어요`;
}

describe('balanceReadOut', () => {
  it.each([
    [100, movies(1)],
    [400, movies(4)],
    // A partial run's worth is not a movie: the count rounds down.
    [450, movies(4)],
  ])('says how many movies %i credits make', (balance, expected) => {
    expect(balanceReadOut(balance)).toBe(expected);
  });

  it.each([
    ['nothing', 0],
    ['less than one run', 99],
    // A store refund can take the balance below zero (spec CRD-6).
    ['a negative balance', -40],
    ['a balance still loading', undefined],
  ])('states the price of one movie for %s', (_, balance) => {
    expect(balanceReadOut(balance)).toBe(price);
  });
});
