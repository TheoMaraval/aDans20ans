import { describe, it, expect } from 'vitest';
import { buildWeeklyReport } from './report';
import { buildEngine } from './engine';
import { acc, inst, makeVault, prices, tx } from './test-fixtures';

describe('rapport hebdo', () => {
  const v = makeVault({
    accounts: [acc({ id: 'pea' })],
    instruments: [inst({ id: 'a', name: 'A', yahooSymbol: 'A' })],
    transactions: [tx({ accountId: 'pea', date: '2024-01-01', type: 'DEPOSIT', amount: 1000 }), tx({ accountId: 'pea', date: '2024-01-01', type: 'BUY', instrumentId: 'a', quantity: 10, unitPrice: 100 })],
    dcaPlans: [{ id: 'd', name: 'DCA A', accountId: 'pea', instrumentId: 'a', amount: 100, frequency: 'WEEKLY', dayOfWeek: 1, startDate: '2024-03-25', fractional: true }],
    settings: { ...makeVault().settings, targetAllocation: { ACTIONS: 1 } },
  });
  const pf = prices({ closes: { A: { '2024-01-01': 100, '2024-03-22': 100, '2024-03-25': 110 } }, quotes: { A: { price: 110, currency: 'EUR', asOf: '2024-03-31T17:00:00Z' } } });
  const r = buildWeeklyReport(buildEngine(v, pf, '2024-03-31'));

  it('totaux et variations', () => {
    expect(r.net).toBeCloseTo(1200, 6);
    expect(r.changes.map((c) => c.label)).toEqual(['Semaine', 'Mois', 'Depuis le 1er janvier']);
    expect(r.changes[0].flows).toBeCloseTo(100, 6);
  });
  it('12 points hebdo', () => { expect(r.weekly).toHaveLength(12); expect(r.weekly.at(-1)!.date).toBe('2024-03-31'); });
  it('allocation vs cible', () => { expect(r.allocation.find((x) => x.cls === 'ACTIONS')?.target).toBe(1); });
  it('DCA de la semaine et à venir', () => {
    expect(r.dcaThisWeek.map((d) => d.date)).toEqual(['2024-03-25']);
    expect(r.dcaNextWeek.map((d) => d.date)).toEqual(['2024-04-01']);
  });
  it('top', () => { expect(r.top[0]?.instrumentId).toBe('a'); });
});
