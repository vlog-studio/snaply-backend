import { requestResetSchema } from './request-reset-schema';

function errorPaths(email: string): string[] {
  const result = requestResetSchema.safeParse({ email });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('requestResetSchema', () => {
  it('accepts a plausible address', () => {
    expect(errorPaths('user@example.com')).toEqual([]);
  });

  it.each(['', 'user', 'user@', 'user@example'])('rejects %p', (email) => {
    expect(errorPaths(email)).toEqual(['email']);
  });

  it('accepts an unknown-but-plausible address — existence is not revealed here', () => {
    expect(errorPaths('nobody@example.com')).toEqual([]);
  });
});
