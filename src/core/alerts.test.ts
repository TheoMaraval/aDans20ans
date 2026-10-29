import { describe, it, expect } from 'vitest';
import { computeAlerts, movers } from './alerts';
import { buildEngine } from './engine';
import { acc, inst, makeVault, prices, tx } from './test-fixtures';

const TODAY = '2024-03-31';
const base = () => makeVault({
  accounts: [acc({ id: 'pea' }), acc({ id: 'la', type: 'LIVRET_A', balanceHistory: [{ date: '2024-01-01', balance: 21000 }] })],
  instruments: [inst({ id: 'a', name: 'A', yahooSymbol: 'A' }), inst({ id: 'b', name: 'B', yahooSymbol: 'B' })],
  transactions: [
    tx({ accountId: 'pea', date: '2024-01-01', type: 'DEPOSIT', amount: 2000 }),
    tx({ accountId: 'pea', date: '2024-01-01', type: 'BUY', instrumentId: 'a', quantity: 10, unitPrice: 100 }),
    tx({ accountId: 'pea', date: '2024-01-01', type: 'BUY', instrumentId: 'b', quantity: 10, unitPrice: 100 }),
  ],
});
const pf = prices({
  updatedAt: `${TODAY}T18:00:00Z`,
  quotes: { A: { price: 120, currency: 'EUR', asOf: `${TODAY}T17:00:00Z` }, B: { price: 90, currency: 'EUR', asOf: `${TODAY}T17:00:00Z` } },
  closes: { A: { '2024-03-01': 100, '2024-03-24': 100 }, B: { '2024-03-01': 100, '2024-03-24': 99 } },
});
const ids = (v = base(), p = pf) => computeAlerts(buildEngine(v, p, TODAY)).map((a) => a.id);

describe('alertes', () => {
  it('variations hebdo', () => {
    const r = ids();
    expect(r).toContain('move:a');
    expect(r).toContain('move:b');
  });
  it('movers triés', () => {
    const m = movers(buildEngine(base(), pf, TODAY), 7);
    expect(m.map((x) => x.instrumentId)).toEqual(['a', 'b']);
    expect(m[0].pct).toBeCloseTo(0.2, 9);
  });
  it('plafond livret A à ≥ 90 %', () => { expect(ids()).toContain('ceiling:la'); });
  it('concentration', () => {
    const v = base(); v.settings.alertThresholds.concentrationPct = 0.05;
    expect(ids(v)).toContain('concentration:a');
  });
  it('dérive d\'allocation + suggestion', () => {
    const v = base(); v.settings.targetAllocation = { ACTIONS: 0.5, CASH: 0.5 };
    const r = ids(v);
    expect(r).toContain('drift:ACTIONS');
    expect(r).toContain('drift:suggestion');
  });
  it('alertes de prix', () => {
    const v = base();
    v.priceAlerts = [
      { id: 'p1', instrumentId: 'b', condition: 'PRICE_BELOW', threshold: 95, active: true },
      { id: 'p2', instrumentId: 'a', condition: 'GAIN_PCT_ABOVE', threshold: 0.5, active: true },
    ];
    const r = ids(v);
    expect(r).toContain('price:p1');
    expect(r).not.toContain('price:p2');
  });
  it('épargne de précaution', () => {
    const v = base(); v.settings.emergencyFundAccountIds = ['la']; v.settings.alertThresholds.emergencyFundMin = 30000;
    expect(ids(v)).toContain('emergency');
  });
  it('données : erreurs de cours et DCA en attente', () => {
    const v = base();
    v.dcaPlans = [{ id: 'd', name: 'D', accountId: 'pea', instrumentId: 'a', amount: 50, frequency: 'MONTHLY', dayOfMonth: 5, startDate: '2024-01-01', fractional: true }];
    const r = ids(v, { ...pf, errors: [{ symbol: 'Z', message: '404', at: TODAY }] });
    expect(r).toContain('data:errors');
    expect(r).toContain('data:pending-dca');
  });
  it('tri par gravité', () => {
    const a = computeAlerts(buildEngine(base(), pf, TODAY));
    const rank = { critical: 0, warn: 1, info: 2 } as const;
    for (let k = 1; k < a.length; k++) expect(rank[a[k - 1].level]).toBeLessThanOrEqual(rank[a[k].level]);
  });
});
