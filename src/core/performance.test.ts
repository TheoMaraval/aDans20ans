import { describe, it, expect } from 'vitest';
import { xirr, externalFlows, periodChange, accountXirr } from './performance';
import { createPriceBook } from './prices';
import { acc, makeVault, prices, tx } from './test-fixtures';

describe('xirr', () => {
  it('cas simple 10 %', () => {
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 1100 }])!).toBeCloseTo(0.1, 4);
  });
  it('perte', () => {
    expect(xirr([{ date: '2023-01-01', amount: -1000 }, { date: '2024-01-01', amount: 800 }])!).toBeCloseTo(-0.2, 4);
  });
  it('flux de même signe : null', () => { expect(xirr([{ date: '2023-01-01', amount: 1 }, { date: '2024-01-01', amount: 1 }])).toBeNull(); });
});

describe('flux externes', () => {
  const vault = makeVault({
    accounts: [acc({ id: 'pea' }), acc({ id: 'la', type: 'LIVRET_A', balanceHistory: [{ date: '2024-01-01', balance: 1000 }, { date: '2024-02-01', balance: 1500 }] })],
    transactions: [tx({ accountId: 'pea', date: '2024-01-15', type: 'DEPOSIT', amount: 200 }), tx({ accountId: 'pea', date: '2024-01-20', type: 'WITHDRAWAL', amount: 50 })],
    loans: [{ id: 'l', name: 'L', kind: 'AUTO', principal: 5000, annualRate: 0, durationMonths: 10, startDate: '2024-02-10', ownershipPct: 1 }],
    physicalAssets: [{ id: 'c', name: 'C', kind: 'VEHICULE', purchaseDate: '2024-01-10', purchasePrice: 8000, depreciation: { model: 'NONE' }, valuations: [], loanIds: ['l'] }],
  });
  const ctx = { vault, book: createPriceBook(prices(), [], '2024-03-01'), transactions: vault.transactions };
  it('somme versements, deltas de solde, achats de biens, emprunts', () => {
    expect(externalFlows(ctx, '2024-01-01', '2024-03-01')).toBeCloseTo(200 - 50 + 500 + 8000 - 5000, 6);
  });
  it('periodChange retire les flux', () => {
    const r = periodChange(10000, 11000, 600);
    expect(r).toMatchObject({ change: 1000, flows: 600, changeExFlows: 400 });
    expect(r.pct).toBeCloseTo(400 / 10300, 9);
  });
  it('xirr d\'un compte', () => {
    const v = makeVault({ accounts: [acc({ id: 'pea' })], transactions: [tx({ accountId: 'pea', date: '2023-01-01', type: 'DEPOSIT', amount: 1000 })] });
    const c = { vault: v, book: createPriceBook(prices(), [], '2024-01-01'), transactions: v.transactions };
    expect(accountXirr(c, ['pea'], 1100, '2024-01-01')!).toBeCloseTo(0.1, 4);
  });
});
