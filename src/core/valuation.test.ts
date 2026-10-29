import { describe, it, expect } from 'vitest';
import { valueAt } from './valuation';
import { createPriceBook } from './prices';
import { acc, inst, makeVault, prices, tx } from './test-fixtures';

const vault = makeVault({
  accounts: [acc({ id: 'pea' }), acc({ id: 'la', type: 'LIVRET_A', balanceHistory: [{ date: '2024-01-01', balance: 5000 }] }),
    acc({ id: 'av', type: 'ASSURANCE_VIE', balanceHistory: [{ date: '2024-01-01', balance: 1000 }] })],
  instruments: [inst({ id: 'cw8', name: 'MSCI World', yahooSymbol: 'CW8.PA' })],
  transactions: [
    tx({ accountId: 'pea', date: '2024-01-02', type: 'DEPOSIT', amount: 1000 }),
    tx({ accountId: 'pea', date: '2024-01-02', type: 'BUY', instrumentId: 'cw8', quantity: 10, unitPrice: 50 }),
  ],
  realEstate: [{ id: 'rp', name: 'RP', kind: 'RESIDENCE_PRINCIPALE', purchaseDate: '2023-01-01', purchasePrice: 100000, ownershipPct: 1, valuations: [], loanIds: ['l1'] }],
  loans: [{ id: 'l1', name: 'Prêt', kind: 'IMMOBILIER', principal: 12000, annualRate: 0, durationMonths: 12, startDate: '2024-01-01', ownershipPct: 1 }],
  physicalAssets: [{ id: 'car', name: 'Clio', kind: 'VEHICULE', purchaseDate: '2023-01-01', purchasePrice: 20000, depreciation: { model: 'NONE' }, valuations: [], loanIds: [] }],
});
const book = createPriceBook(prices({ closes: { 'CW8.PA': { '2024-01-10': 60 } } }), vault.transactions, '2024-02-01');

describe('valueAt', () => {
  const b = valueAt({ vault, book, transactions: vault.transactions }, '2024-01-10');
  it('totaux', () => {
    expect(b.gross).toBeCloseTo(600 + 500 + 5000 + 1000 + 100000 + 20000, 6);
    expect(b.debts).toBe(11000);
    expect(b.net).toBeCloseTo(127100 - 11000, 6);
    expect(b.invested).toBe(1000);
  });
  it('répartitions', () => {
    expect(b.byClass).toEqual({ ACTIONS: 600, CASH: 5500, OBLIGATIONS: 1000, IMMOBILIER: 100000, BIENS: 20000 });
    expect(b.byGroup).toMatchObject({ PEA: 1100, LIVRET_A: 5000, ASSURANCE_VIE: 1000, IMMOBILIER: 100000, BIENS: 20000 });
    expect(b.byAccount).toMatchObject({ pea: 1100, la: 5000, rp: 100000, car: 20000 });
    expect(b.cashByAccount.pea).toBe(500);
    expect(b.debtsByLoan.l1).toBe(11000);
  });
  it('position', () => {
    expect(b.positions).toHaveLength(1);
    expect(b.positions[0]).toMatchObject({ name: 'MSCI World', quantity: 10, pru: 50, price: 60, value: 600, unrealized: 100, unrealizedPct: 0.2, priceSource: 'close' });
    expect(b.positions[0].weight).toBeCloseTo(600 / 127100, 9);
  });
  it('position sans aucun cours : valorisée au PRU', () => {
    const v2 = makeVault({ ...vault, instruments: [inst({ id: 'cw8' })] });
    const b2 = valueAt({ vault: v2, book: createPriceBook(prices(), [], '2024-02-01'), transactions: vault.transactions }, '2024-01-10');
    expect(b2.positions[0]).toMatchObject({ priceSource: 'cost', price: 50, value: 500, unrealized: 0 });
  });
});
