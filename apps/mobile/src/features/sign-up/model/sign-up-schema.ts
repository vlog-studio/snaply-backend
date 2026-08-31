import { z } from 'zod';

import { PASSWORD_MIN_LENGTH, isValidEmail, isValidPassword } from '@/shared/lib/validation';

/**
 * What the account-creation form accepts: a plausible address, a password long
 * enough to keep, and a confirmation that matches it.
 *
 * The mismatch check is a whole-object rule, so it carries an explicit `path` —
 * without it the message would attach to the form rather than to the field the
 * user has to fix.
 *
 * Password rules are duplicated in `features/reset-password` rather than shared
 * between the two slices. Same-layer slices stay independent, and the two have
 * separate reasons to change: sign-up may add strength requirements that a
 * recovery screen would not.
 */
export const signUpSchema = z
  .object({
    email: z.string().refine(isValidEmail, '올바른 이메일 주소를 입력해 주세요.'),
    password: z
      .string()
      .refine(isValidPassword, `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`),
    confirm: z.string(),
  })
  .refine((values) => values.confirm === values.password, {
    message: '비밀번호가 일치하지 않아요.',
    path: ['confirm'],
  });

export type SignUpValues = z.infer<typeof signUpSchema>;
