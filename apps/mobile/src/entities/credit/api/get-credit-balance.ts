import { apiRequest } from '@/shared/api';
import { USE_MOCK_API } from '@/shared/config/api';

import type { CreditBalance } from '../model/credit';
import { creditBalanceDtoSchema, mapCreditBalance } from './credit.dto';
import { readMockCreditBalance } from './mock-credits';

async function getCreditBalanceFromApi(signal?: AbortSignal): Promise<CreditBalance> {
  const dto = await apiRequest('/billing/credits', {
    method: 'GET',
    schema: creditBalanceDtoSchema,
    signal,
  });
  return mapCreditBalance(dto);
}

// Same return type as the API branch; the mock ledger lives in mock-credits.ts
// so mock-mode grants (the rewarded-ad flow) move this balance too.
function getCreditBalanceMock(): Promise<CreditBalance> {
  return Promise.resolve(readMockCreditBalance());
}

/**
 * Fetch the credit balance and recent ledger (`GET /billing/credits`). The
 * backend is the only source of the balance; the app never derives it. Routes
 * to the in-code mock until an API origin is configured (see `USE_MOCK_API`).
 */
export function getCreditBalance(signal?: AbortSignal): Promise<CreditBalance> {
  return USE_MOCK_API ? getCreditBalanceMock() : getCreditBalanceFromApi(signal);
}
