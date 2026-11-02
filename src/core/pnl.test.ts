import { describe, it, expect } from 'vitest';
import { periodPnl, periodStart } from './pnl';
import { buildEngine } from './engine';
import { acc, inst, makeVault, prices, tx } from './test-fixtures';

// Un compte : 1 000 € versés le 01/01 ; 10 titres à 50 € ; cours 60 € au 31/01 ; achat de 5 titres à 60 € le 15/02 (versement 300 €) ;
// dividende 10 € le 20/02 ; cours 70 € au 28/02.
const v = makeVault({
  accounts: [acc({ id: 'pea' }), acc({ id: 'cto', type: 'CTO' })],
  instruments: [inst({ id: 'x', name: 'X', yahooSymbol: 'X' })],
  transactions: [
    tx({ accountId: 'pea', date: '2024-01-01', type: 'DEPOSIT', amount: 1000 }),
    tx({ accountId: 'pea', date: '2024-01-01', type: 'BUY', instrumentId: 'x', quantity: 10, unitPrice: 50 }),
    tx({ accountId: 'pea', date: '2024-02-15', type: 'DEPOSIT', amount: 300 }),
    tx({ accountId: 'pea', date: '2024-02-15', type: 'BUY', instrumentId: 'x', quantity: 5, unitPrice: 60 }),
    tx({ accountId: 'pea', date: '2024-02-20', type: 'DIVIDEND', instrumentId: 'x', amount: 10 }),
  ],
});
const pf = prices({ closes: { X: { '2024-01-01': 50, '2024-01-31': 60, '2024-02-15': 60, '2024-02-28': 70 } } });
const e = buildEngine(v, pf, '2024-02-28');

describe('P&L sur une période', () => {
  it('février : hausse des titres détenus + dividende, sans compter l\'achat comme un gain', () => {
    const r = periodPnl(e.ctx, ['pea'], '2024-01-31', '2024-02-28');
    // début : 10 × 60 + 500 cash = 1 100 ; fin : 15 × 70 + 510 cash = 1 560 ; apports 300 → P&L 160
    expect(r.startValue).toBe(1100);
    expect(r.endValue).toBe(1560);
    expect(r.flows).toBe(300);
    expect(r.pnl).toBe(160);
    expect(r.pct).toBeCloseTo(160 / (1100 + 150), 9);
    // position : 10 × (70 − 60) + 5 × (70 − 60) = 150, + dividende 10
    expect(r.byPosition['pea|x'].pnl).toBeCloseTo(160, 9);
  });
  it('depuis le début = gain total', () => {
    const r = periodPnl(e.ctx, ['pea'], periodStart('MAX', '2024-02-28', v), '2024-02-28');
    expect(r.pnl).toBeCloseTo(1560 - 1300, 9);
    expect(r.pct).toBeCloseTo(260 / 1300, 9);
    expect(r.byPosition['pea|x'].pnl).toBeCloseTo(15 * 70 - 800 + 10, 9);
  });
  it('n\'inclut que les comptes demandés', () => {
    expect(periodPnl(e.ctx, ['cto'], '2024-01-31', '2024-02-28').pnl).toBe(0);
  });
  it('dates de début des périodes', () => {
    expect(periodStart('1J', '2024-03-15', v)).toBe('2024-03-14');
    expect(periodStart('1S', '2024-03-15', v)).toBe('2024-03-08');
    expect(periodStart('1M', '2024-03-15', v)).toBe('2024-02-15');
    expect(periodStart('6M', '2024-03-15', v)).toBe('2023-09-15');
    expect(periodStart('1A', '2024-03-15', v)).toBe('2023-03-15');
    expect(periodStart('MAX', '2024-03-15', v)).toBe('2023-12-31');
  });
});
