import { describe, it, expect } from 'vitest';
import { runLedger } from './positions';
import { createPriceBook } from './prices';
import { acc, inst, prices, tx } from './test-fixtures';

const accounts = new Map([['pea', acc({ id: 'pea' })]]);
const instruments = new Map([['cw8', inst({ id: 'cw8' })], ['aapl', inst({ id: 'aapl', currency: 'USD' })]]);
const book = createPriceBook(prices({ fxCloses: { USD: { '2024-01-01': 0.9 } } }), [], '2024-12-31');

describe('runLedger', () => {
  const txs = [
    tx({ accountId: 'pea', date: '2024-01-01', type: 'DEPOSIT', amount: 3000 }),
    tx({ accountId: 'pea', date: '2024-01-02', type: 'BUY', instrumentId: 'cw8', quantity: 10, unitPrice: 100, fees: 1 }),
    tx({ accountId: 'pea', date: '2024-02-01', type: 'BUY', instrumentId: 'cw8', quantity: 10, unitPrice: 120, fees: 1 }),
    tx({ accountId: 'pea', date: '2024-03-01', type: 'SELL', instrumentId: 'cw8', quantity: 5, unitPrice: 130, fees: 1 }),
    tx({ accountId: 'pea', date: '2024-03-02', type: 'DIVIDEND', instrumentId: 'cw8', amount: 12 }),
  ];
  it('PRU moyen pondéré frais inclus, PV réalisée', () => {
    const r = runLedger(txs, accounts, instruments, book);
    const p = r.positions[0];
    expect(p.quantity).toBe(15);
    expect(p.costBasis).toBeCloseTo(1651.5, 6);
    expect(p.costBasis / p.quantity).toBeCloseTo(110.1, 6);
    expect(p.realized).toBeCloseTo(98.5, 6);
    expect(p.dividends).toBe(12);
    expect(r.cash.pea).toBeCloseTo(3000 - 1001 - 1201 + 649 + 12, 6);
    expect(r.netDeposits.pea).toBe(3000);
  });
  it('respecte la date limite', () => {
    const r = runLedger(txs, accounts, instruments, book, '2024-01-15');
    expect(r.positions[0].quantity).toBe(10);
  });
  it('devise : fxRate explicite sinon PriceBook', () => {
    const r = runLedger([
      tx({ accountId: 'pea', date: '2024-01-05', type: 'BUY', instrumentId: 'aapl', quantity: 2, unitPrice: 100, fees: 1, fxRate: 0.95 }),
      tx({ accountId: 'pea', date: '2024-01-06', type: 'BUY', instrumentId: 'aapl', quantity: 1, unitPrice: 100 }),
    ], accounts, instruments, book);
    expect(r.positions[0].costBasis).toBeCloseTo(2 * 100 * 0.95 + 1 + 90, 6);
  });
  it('vente supérieure à la quantité : erreur, quantité bornée à 0', () => {
    const r = runLedger([
      tx({ accountId: 'pea', date: '2024-01-02', type: 'BUY', instrumentId: 'cw8', quantity: 1, unitPrice: 10 }),
      tx({ accountId: 'pea', date: '2024-01-03', type: 'SELL', instrumentId: 'cw8', quantity: 2, unitPrice: 10 }),
    ], accounts, instruments, book);
    expect(r.errors).toHaveLength(1);
    expect(r.positions[0].quantity).toBe(0);
  });
});
