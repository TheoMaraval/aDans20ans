import { describe, it, expect } from 'vitest';
import { earliestDate, sampleDates, rebuildHistory } from './history';
import { createPriceBook } from './prices';
import { acc, inst, makeVault, prices, tx } from './test-fixtures';

describe('historique', () => {
  it('sampleDates : quotidien sur 365 j, hebdo avant', () => {
    const d = sampleDates('2022-01-01', '2024-01-01');
    expect(d.at(-1)).toBe('2024-01-01');
    expect(d.filter((x) => x >= '2023-01-01').length).toBe(366);
    expect(d[0] >= '2022-01-01').toBe(true);
    expect(d.filter((x) => x < '2023-01-01').length).toBeLessThan(60);
  });
  it('earliestDate', () => {
    const v = makeVault({ accounts: [acc({ id: 'a', balanceHistory: [{ date: '2021-05-01', balance: 1 }] })], transactions: [tx({ accountId: 'a', date: '2022-01-01', type: 'DEPOSIT', amount: 1 })] });
    expect(earliestDate(v)).toBe('2021-05-01');
    expect(earliestDate(makeVault())).toBeNull();
  });
  it('rebuildHistory suit les cours', () => {
    const v = makeVault({ accounts: [acc({ id: 'pea' })], instruments: [inst({ id: 'x', yahooSymbol: 'X' })],
      transactions: [tx({ accountId: 'pea', date: '2024-01-01', type: 'BUY', instrumentId: 'x', quantity: 1, unitPrice: 10 })] });
    const book = createPriceBook(prices({ closes: { X: { '2024-01-01': 10, '2024-01-02': 12 } } }), v.transactions, '2024-01-03');
    const h = rebuildHistory({ vault: v, book, transactions: v.transactions }, '2024-01-01', '2024-01-02');
    expect(h.map((s) => [s.date, s.gross])).toEqual([['2024-01-01', 0], ['2024-01-02', 2]]);
  });
});
