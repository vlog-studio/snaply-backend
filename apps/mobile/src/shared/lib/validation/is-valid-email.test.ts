import { isValidEmail } from './is-valid-email';

describe('isValidEmail', () => {
  it('accepts a well-formed address', () => {
    expect(isValidEmail('me@example.com')).toBe(true);
    expect(isValidEmail('  me@example.com  ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidEmail('')).toBe(false);
    expect(isValidEmail('me@example')).toBe(false);
    expect(isValidEmail('me example.com')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
  });
});
