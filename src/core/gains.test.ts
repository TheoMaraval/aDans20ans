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
    expect(g.netDeposits).toBe(1200); // le Livret A (5 000 €) n'est ni un versement ni un gain
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

describe('plus-values sur une période', () => {
  const e = buildEngine(v, prices({ closes: { X: { '2024-01-01': 100, '2024-01-15': 110, '2024-03-01': 120 } } }), '2024-03-01');
  it('du 15/01 au 01/03 : +100 de cours sur X, +100 réalisé sur M (vendu le 01/02)', () => {
    const g = gainsSummary(e, '2024-01-15');
    // valeur au 15/01 : 10 × 110 + 2 × (prix de transaction 100) = 1 300 ; au 01/03 : 1 500 ; aucun apport
    expect(g.investGain).toBeCloseTo(200, 9);
    expect(g.realized).toBeCloseTo(100, 9);
    expect(g.unrealized).toBeCloseTo(100, 9);
    expect(g.investPct).toBeCloseTo(200 / 1300, 9);
  });
  it('immobilier : variation d\'estimation sur la période', () => {
    // 2023 → 2024 : estimation constante après le 01/01/2023
    expect(gainsSummary(e, '2023-06-01').realEstateGain).toBe(0);
    // depuis avant l'achat : plus-value complète
    expect(gainsSummary(e, '2019-01-01').realEstateGain).toBe(20000);
  });
});
