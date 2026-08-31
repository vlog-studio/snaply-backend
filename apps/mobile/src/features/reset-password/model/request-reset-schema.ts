import { z } from 'zod';

import { isValidEmail } from '@/shared/lib/validation';

/**
 * Step 1 of password reset: which address the recovery link goes to. Only the
 * format is checked — whether an account exists is deliberately not revealed,
 * and `requestReset` resolves either way (no enumeration).
 */
export const requestResetSchema = z.object({
  email: z.string().refine(isValidEmail, '올바른 이메일 주소를 입력해 주세요.'),
});

export type RequestResetValues = z.infer<typeof requestResetSchema>;
