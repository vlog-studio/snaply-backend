import { emailSignInSchema } from './email-sign-in-schema';

/** The field each issue landed on, so a message reaches the input to fix. */
function errorPaths(values: { email: string; password: string }): string[] {
  const result = emailSignInSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('emailSignInSchema', () => {
  it('accepts a plausible address with any non-empty password', () => {
    expect(errorPaths({ email: 'user@example.com', password: 'x' })).toEqual([]);
  });

  it.each(['', 'user', 'user@', 'user@example', 'a b@example.com'])(
    'rejects %p as an address',
    (email) => {
      expect(errorPaths({ email, password: 'secret123' })).toEqual(['email']);
    },
  );

  it('rejects an empty password', () => {
    expect(errorPaths({ email: 'user@example.com', password: '' })).toEqual(['password']);
  });

  it('reports both fields at once, so one submit surfaces everything wrong', () => {
    expect(errorPaths({ email: 'nope', password: '' })).toEqual(['email', 'password']);
  });

  it('does not apply the sign-up length rule — an older short password still signs in', () => {
    expect(errorPaths({ email: 'user@example.com', password: 'short' })).toEqual([]);
  });
});
