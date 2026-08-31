import { PASSWORD_MIN_LENGTH } from '@/shared/lib/validation';

import { signUpSchema } from './sign-up-schema';

const valid = { email: 'user@example.com', password: 'secret123', confirm: 'secret123' };

function errorPaths(values: typeof valid): string[] {
  const result = signUpSchema.safeParse(values);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('signUpSchema', () => {
  it('accepts a plausible address with a long-enough, confirmed password', () => {
    expect(errorPaths(valid)).toEqual([]);
  });

  it.each(['', 'user', 'user@example'])('rejects %p as an address', (email) => {
    expect(errorPaths({ ...valid, email })).toEqual(['email']);
  });

  it('rejects a password shorter than the shared minimum', () => {
    const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);

    expect(errorPaths({ ...valid, password: short, confirm: short })).toEqual(['password']);
  });

  it('accepts a password of exactly the minimum length', () => {
    const exact = 'a'.repeat(PASSWORD_MIN_LENGTH);

    expect(errorPaths({ ...valid, password: exact, confirm: exact })).toEqual([]);
  });

  it('attaches a mismatch to the confirmation field rather than to the form', () => {
    expect(errorPaths({ ...valid, confirm: 'different1' })).toEqual(['confirm']);
  });

  it('reports the length rule alone when the confirmation still matches', () => {
    expect(errorPaths({ ...valid, password: 'short', confirm: 'short' })).toEqual(['password']);
  });

  it('reports the length rule and the mismatch together when both are wrong', () => {
    // Zod 4 runs an object-level check even after a field-level one failed (Zod 3
    // skipped it), so both messages surface at once. That is what the hand-rolled
    // validation this replaced did too — both statements are true, and each lands
    // on the field it belongs to.
    expect(errorPaths({ ...valid, password: 'short', confirm: 'different1' })).toEqual([
      'password',
      'confirm',
    ]);
  });
});
