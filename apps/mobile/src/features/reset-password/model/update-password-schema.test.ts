import { PASSWORD_MIN_LENGTH } from '@/shared/lib/validation';

import { updatePasswordSchema } from './update-password-schema';

function errorPaths(password: string, confirm: string): string[] {
  const result = updatePasswordSchema.safeParse({ password, confirm });
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('updatePasswordSchema', () => {
  it('accepts a long-enough, confirmed password', () => {
    expect(errorPaths('secret123', 'secret123')).toEqual([]);
  });

  it('accepts a password of exactly the minimum length', () => {
    const exact = 'a'.repeat(PASSWORD_MIN_LENGTH);

    expect(errorPaths(exact, exact)).toEqual([]);
  });

  it('rejects a password shorter than the shared minimum', () => {
    const short = 'a'.repeat(PASSWORD_MIN_LENGTH - 1);

    expect(errorPaths(short, short)).toEqual(['password']);
  });

  it('attaches a mismatch to the confirmation field rather than to the form', () => {
    expect(errorPaths('secret123', 'secret124')).toEqual(['confirm']);
  });

  it('reports the length rule and the mismatch together when both are wrong', () => {
    // Zod 4 runs an object-level check even after a field-level one failed, so both
    // land at once — matching the hand-rolled validation this replaced.
    expect(errorPaths('short', 'different1')).toEqual(['password', 'confirm']);
  });

  it('never asks for the old password — the recovery link was the proof', () => {
    expect(
      Object.keys(updatePasswordSchema.parse({ password: 'secret123', confirm: 'secret123' })),
    ).toEqual(['password', 'confirm']);
  });
});
