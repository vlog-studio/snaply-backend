import { creditBalanceDtoSchema, mapCreditBalance } from './credit.dto';

describe('creditBalanceDtoSchema + mapCreditBalance', () => {
  it('maps wire entries to domain entries with a parsed date', () => {
    const dto = creditBalanceDtoSchema.parse({
      balance: 120,
      entries: [
        { id: 'a', delta: -100, reason: 'export_reserve', createdAt: '2026-08-14T01:00:00.000Z' },
      ],
    });

    const balance = mapCreditBalance(dto);

    expect(balance.balance).toBe(120);
    expect(balance.entries).toEqual([
      {
        id: 'a',
        delta: -100,
        reason: 'export_reserve',
        createdAt: new Date('2026-08-14T01:00:00.000Z'),
      },
    ]);
  });

  it('accepts a reason the app has never seen instead of failing the response', () => {
    const parsed = creditBalanceDtoSchema.safeParse({
      balance: 0,
      entries: [
        { id: 'b', delta: 30, reason: 'ops_apology_2027', createdAt: '2026-08-14T01:00:00.000Z' },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
