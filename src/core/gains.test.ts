import { describe, it, expect } from 'vitest';
import { gainsSummary } from './gains';
import { buildEngine } from './engine';
import { acc, inst, makeVault, prices, tx } from './test-fixtures';

const v = makeVault({
  accounts: [acc({ id: 'pea' }), acc({ id: 'cto', type: 'CTO' }), acc({ id: 'la', type: 'LIVRET_A', balanceHistory: [{ date: '2024-01-01', balance: 5000 }] })],
  instruments: [inst({ id: 'x', yahooSymbol: 'X' }), inst({ id: 'm', yahooSymbol: 'M' })],
  transactions: [
    tx({ accountId: 'pea', date: '2024-01-01', type: 'DEPOSIT', amount: 1000 }),
    tx({ accountId: 'pea', date: '2024-01-01', type: 'BUY', instrumentId: 'x', quantity: 10, unitPrice: 100 }),
    tx({ accountId: 'cto', date: '2024-01-01', type: 'DEPOSIT', amount: 200 }),
    tx({ accountId: 'cto', date: '2024-01-01', type: 'BUY', instrumentId: 'm', quantity: 2, unitPrice: 100 }),
    tx({ accountId: 'cto', date: '2024-02-01', type: 'SELL', instrumentId: 'm', quantity: 2, unitPrice: 150 }),
  ],
  realEstate: [{ id: 'rp', name: 'RP', kind: 'RESIDENCE_PRINCIPALE', purchaseDate: '2020-01-01', purchasePrice: 200000, ownershipPct: 0.5, valuations: [{ date: '2023-01-01', value: 240000 }], loanIds: [] }],
});

describe('plus-values du patrimoine', () => {
  const g = gainsSummary(buildEngine(v, prices({ closes: { X: { '2024-03-01': 120 } } }), '2024-03-01'));
  it('placements : gain total = latent + réalisé, en % des versements', () => {
    expect(g.unrealized).toBe(200);
    expect(g.realized).toBe(100);
    expect(g.investGain).toBe(300);
    expect(g.netDeposits).toBe(1200);
    expect(g.investPct).toBeCloseTo(0.25, 9);
  });
  it('les livrets ne comptent pas comme placements', () => {
    expect(g.investValue).toBe(1500);
  });
  it('plus-value immobilière à la quote-part', () => {
    expect(g.realEstateGain).toBe(20000);
  });
});

describe('fonds euros saisi comme solde', () => {
  it('n\'est pas compté comme un gain', () => {
    const v2 = makeVault({ ...v, accounts: [...v.accounts, acc({ id: 'av', type: 'ASSURANCE_VIE', balanceHistory: [{ date: '2024-01-01', balance: 8200 }] })] });
    const g2 = gainsSummary(buildEngine(v2, prices({ closes: { X: { '2024-03-01': 120 } } }), '2024-03-01'));
    expect(g2.investGain).toBe(300);
  });
});
