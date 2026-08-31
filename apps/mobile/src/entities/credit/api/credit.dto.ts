import { z } from 'zod';

import type { CreditBalance } from '../model/credit';

/**
 * The wire shape of `GET /billing/credits` (`data`), validated at the
 * transport boundary and mapped to the `CreditBalance` domain model.
 *
 * `reason` is an enum in the spec but a plain string here on purpose (the
 * same call as `location.dto.ts`'s `category`): a reason added on the backend
 * must not fail the whole balance response and blank the screen that shows it.
 */
const creditEntryDtoSchema = z.object({
  id: z.string(),
  delta: z.number().int(),
  reason: z.string(),
  createdAt: z.string(),
});

export const creditBalanceDtoSchema = z.object({
  balance: z.number().int(),
  entries: z.array(creditEntryDtoSchema),
});

export type CreditBalanceDto = z.infer<typeof creditBalanceDtoSchema>;

export function mapCreditBalance(dto: CreditBalanceDto): CreditBalance {
  return {
    balance: dto.balance,
    entries: dto.entries.map((entry) => ({
      id: entry.id,
      delta: entry.delta,
      reason: entry.reason,
      createdAt: new Date(entry.createdAt),
    })),
  };
}
