import { z } from 'zod';

import { PASSWORD_MIN_LENGTH, isValidPassword } from '@/shared/lib/validation';

/**
 * Step 2 of password reset: the new password and its confirmation. The old
 * password is not asked for — reaching this screen already required a recovery
 * link, which is the proof.
 *
 * The mismatch check carries an explicit `path` so the message lands on the
 * confirmation field the user has to fix.
 */
export const updatePasswordSchema = z
  .object({
    password: z
      .string()
      .refine(isValidPassword, `비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 해요.`),
    confirm: z.string(),
  })
  .refine((values) => values.confirm === values.password, {
    message: '비밀번호가 일치하지 않아요.',
    path: ['confirm'],
  });

export type UpdatePasswordValues = z.infer<typeof updatePasswordSchema>;
