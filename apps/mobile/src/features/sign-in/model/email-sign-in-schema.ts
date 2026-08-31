import { z } from 'zod';

import { isValidEmail } from '@/shared/lib/validation';

/**
 * What the email sign-in form accepts. Sign-in only checks that the fields are
 * usable — the password is verified by the provider, so this deliberately does
 * not apply the sign-up length rule: an account created before that rule existed
 * must still be able to sign in.
 *
 * Address format goes through `isValidEmail` rather than Zod's own email check,
 * keeping the deliberately permissive rule documented in `shared/lib/validation`.
 */
export const emailSignInSchema = z.object({
  email: z.string().refine(isValidEmail, '올바른 이메일 주소를 입력해 주세요.'),
  password: z.string().min(1, '비밀번호를 입력해 주세요.'),
});

export type EmailSignInValues = z.infer<typeof emailSignInSchema>;
