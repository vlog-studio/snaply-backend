import { apiPath } from './paths';

describe('apiPath', () => {
  it('returns a parameterless path unchanged', () => {
    expect(apiPath('/health')).toBe('/health');
  });

  it.each([
    ['plain id', 'video-1', '/videos/video-1'],
    [
      'uuid',
      '550e8400-e29b-41d4-a716-446655440000',
      '/videos/550e8400-e29b-41d4-a716-446655440000',
    ],
    ['reserved characters are URL-encoded', 'a/b?c', '/videos/a%2Fb%3Fc'],
  ])('substitutes {id} (%s)', (_label, id, expected) => {
    expect(apiPath('/videos/{id}', { id })).toBe(expected);
  });

  it('accepts numeric parameter values', () => {
    expect(apiPath('/edit-jobs/{id}', { id: 42 })).toBe('/edit-jobs/42');
  });
});
