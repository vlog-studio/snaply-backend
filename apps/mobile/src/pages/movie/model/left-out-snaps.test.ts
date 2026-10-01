import { offerableLeftOut } from './left-out-snaps';

describe('offerableLeftOut', () => {
  const library = new Set(['a', 'b', 'c', 'held']);
  const inLibrary = (snapId: string) => library.has(snapId);

  it('offers what the draft left out', () => {
    expect(offerableLeftOut({ leftOut: ['a', 'b'], snapRefs: [] }, inLibrary)).toEqual(['a', 'b']);
  });

  it('stops offering a snap once it is back in the movie', () => {
    const movie = { leftOut: ['a', 'held'], snapRefs: [{ snapId: 'held', order: 0 }] };
    expect(offerableLeftOut(movie, inLibrary)).toEqual(['a']);
  });

  it('stops offering a snap deleted from the library since', () => {
    expect(offerableLeftOut({ leftOut: ['a', 'gone'], snapRefs: [] }, inLibrary)).toEqual(['a']);
  });

  it('offers nothing on a movie the draft did not make', () => {
    expect(offerableLeftOut({ snapRefs: [] }, inLibrary)).toEqual([]);
  });
});
