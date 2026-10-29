import { describe, it, expect } from 'vitest';
import { scheduleDates, expandTransactions, monthlyEquivalent, projectDca } from './dca';
import { createPriceBook } from './prices';
import { acc, inst, makeVault, prices, tx } from './test-fixtures';
import type { DcaPlan } from './types';

const plan: DcaPlan = { id: 'p1', name: 'CW8', accountId: 'pea', instrumentId: 'cw8', amount: 100, frequency: 'MONTHLY', dayOfMonth: 5, startDate: '2024-01-01', fractional: true };

describe('scheduleDates', () => {
  it('mensuel', () => { expect(scheduleDates(plan, '2024-01-01', '2024-03-31')).toEqual(['2024-01-05', '2024-02-05', '2024-03-05']); });
  it('départ après le jour du mois', () => {
    expect(scheduleDates({ ...plan, startDate: '2024-01-10' }, undefined, '2024-02-28')).toEqual(['2024-02-05']);
  });
  it('trimestriel', () => {
    expect(scheduleDates({ ...plan, frequency: 'QUARTERLY' }, undefined, '2024-12-31')).toEqual(['2024-01-05', '2024-04-05', '2024-07-05', '2024-10-05']);
  });
  it('hebdo et bimensuel', () => {
    const w: DcaPlan = { ...plan, frequency: 'WEEKLY', dayOfWeek: 1, startDate: '2024-01-03' };
    expect(scheduleDates(w, undefined, '2024-01-20')).toEqual(['2024-01-08', '2024-01-15']);
    expect(scheduleDates({ ...w, frequency: 'BIWEEKLY' }, undefined, '2024-01-31')).toEqual(['2024-01-08', '2024-01-22']);
  });
  it('fin et pause', () => {
    expect(scheduleDates({ ...plan, endDate: '2024-02-01' }, undefined, '2024-12-31')).toEqual(['2024-01-05']);
    expect(scheduleDates({ ...plan, pausedFrom: '2024-02-01' }, undefined, '2024-12-31')).toEqual(['2024-01-05']);
  });
  it('fenêtre from', () => { expect(scheduleDates(plan, '2024-02-06', '2024-04-30')).toEqual(['2024-03-05', '2024-04-05']); });
});

describe('expandTransactions', () => {
  const vault = makeVault({ accounts: [acc({ id: 'pea' })], instruments: [inst({ id: 'cw8', yahooSymbol: 'CW8.PA' })], dcaPlans: [plan] });
  const pf = prices({ closes: { 'CW8.PA': { '2024-01-05': 50, '2024-02-06': 40 } } });

  it('génère achats virtuels + versements implicites, échéance en attente', () => {
    const book = createPriceBook(pf, [], '2024-03-10');
    const r = expandTransactions(vault, book, '2024-03-10');
    const buys = r.transactions.filter((t) => t.type === 'BUY');
    expect(buys.map((b) => [b.date, b.quantity])).toEqual([['2024-01-05', 2], ['2024-02-06', 2.5]]);
    expect(buys.every((b) => b.virtual)).toBe(true);
    expect(r.transactions.filter((t) => t.type === 'DEPOSIT').map((d) => d.amount)).toEqual([100, 100]);
    expect(r.pending).toEqual([{ planId: 'p1', date: '2024-03-05' }]);
  });
  it('non fractionnaire et frais', () => {
    const v = { ...vault, dcaPlans: [{ ...plan, fractional: false, feesPct: 0.01 }] };
    const r = expandTransactions(v, createPriceBook(pf, [], '2024-02-28'), '2024-02-28');
    const buys = r.transactions.filter((t) => t.type === 'BUY');
    expect(buys.map((b) => b.quantity)).toEqual([1, 2]);
    expect(buys[0].fees).toBeCloseTo(1, 6);
  });
  it('une correction réelle remplace l\'achat virtuel', () => {
    const real = tx({ id: 'r1', accountId: 'pea', date: '2024-02-05', type: 'BUY', instrumentId: 'cw8', quantity: 2.4, unitPrice: 41, fees: 0.5, dcaPlanId: 'p1', dcaDate: '2024-02-05' });
    const v = { ...vault, transactions: [real] };
    const r = expandTransactions(v, createPriceBook(pf, [real], '2024-02-28'), '2024-02-28');
    const buys = r.transactions.filter((t) => t.type === 'BUY');
    expect(buys.map((b) => b.id)).toEqual(['r1', 'dca:p1:2024-01-05']);
    const dep = r.transactions.find((t) => t.id === 'dcadep:p1:2024-02-05');
    expect(dep?.amount).toBeCloseTo(2.4 * 41 + 0.5, 6);
  });
});

describe('projection', () => {
  it('équivalent mensuel', () => {
    expect(monthlyEquivalent({ ...plan, frequency: 'WEEKLY' })).toBeCloseTo(100 * 52 / 12, 6);
    expect(monthlyEquivalent({ ...plan, frequency: 'QUARTERLY' })).toBeCloseTo(100 / 3, 6);
  });
  it('rendement nul = somme des versements', () => {
    const p = projectDca(1000, 100, 0, 2);
    expect(p.at(-1)).toEqual({ year: 2, invested: 3400, value: 3400 });
  });
  it('rendement positif > versements', () => {
    const p = projectDca(0, 100, 0.07, 10);
    expect(p.at(-1)!.invested).toBe(12000);
    expect(p.at(-1)!.value).toBeGreaterThan(17000);
    expect(p.at(-1)!.value).toBeLessThan(17500);
  });
});
