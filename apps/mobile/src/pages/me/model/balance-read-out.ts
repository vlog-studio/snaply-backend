/**
 * What one movie run costs, in credits (spec CRD-1). A fixed unit — the spec
 * rules out ever rescaling it — which is why the screen may divide by it
 * instead of asking the server.
 */
const MovieRunCredits = 100;

/**
 * The line under the 크레딧 screen's balance.
 *
 * With enough for at least one run it says how many movies the balance makes,
 * so the user does not have to divide by 100 to learn what the number buys.
 * Below that — including a negative balance after a store refund (CRD-6), and
 * while the balance is still loading — the useful fact is the price of one, so
 * it says that instead of "0편".
 */
export function balanceReadOut(balance: number | undefined): string {
  const movies = balance === undefined ? 0 : Math.floor(balance / MovieRunCredits);
  return movies > 0
    ? `보유 크레딧 · 무비 ${movies}편을 만들 수 있어요`
    : `보유 크레딧 · 무비 1편 = ${MovieRunCredits}`;
}
