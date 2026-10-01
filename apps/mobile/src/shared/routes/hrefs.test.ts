import { draftPickerHref, snapPickerHref } from './hrefs';

type PickerHref = { pathname: string; params: { select: string; at: string } };

describe('picker hrefs', () => {
  // The Snap tab stays mounted, and navigation does not re-apply nested params
  // equal to the last ones — a second tap on the same row would open the tab
  // browsing. Each request has to look new.
  it.each([
    ['a new movie', snapPickerHref, '1'],
    ['the edit draft', draftPickerHref, 'draft'],
  ])('asks for %s with a request no earlier one matches', (_name, href, select) => {
    const first = href() as PickerHref;
    const second = href() as PickerHref;

    expect(first).toMatchObject({ pathname: '/snaps', params: { select } });
    expect(second.params.at).not.toBe(first.params.at);
  });
});
