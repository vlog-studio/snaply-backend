export type { CreditBalance, CreditEntry } from './model/credit';
export { creditQueries } from './api/credit.queries';
// Mock-only seam (see its JSDoc): lets mock-mode flows move and read the mock
// ledger. Production writes happen server-side; callers guard with `USE_MOCK_API`.
export { grantMockCredits, readMockCreditBalance } from './api/mock-credits';
