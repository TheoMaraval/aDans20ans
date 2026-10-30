import { describe, it, expect } from 'vitest';
import { addPrivateInvestment } from './privateEquity';
import { buildEngine } from './engine';
import { emptyPriceFile } from './prices';
import { makeVault } from './test-fixtures';

describe('investissement non coté', () => {
  it('crée le compte, l\'actif, le versement et l\'achat ; valorisé à la valeur saisie', () => {
    const v = addPrivateInvestment(makeVault(), { accountId: 'new', name: 'Startup A', date: '2025-03-01', amount: 6500, currentValue: 8000, today: '2026-10-30' });
    expect(v.accounts[0]).toMatchObject({ type: 'NON_COTE', name: 'Startups (non coté)' });
    expect(v.instruments[0]).toMatchObject({ name: 'Startup A', assetClass: 'NON_COTE', kind: 'OTHER' });
    const e = buildEngine(v, emptyPriceFile(), '2026-10-30');
    expect(e.current.byClass.NON_COTE).toBe(8000);
    expect(e.current.cashByAccount[v.accounts[0].id] ?? 0).toBe(0);
    expect(e.current.positions[0]).toMatchObject({ costBasis: 6500, unrealized: 1500 });
  });
  it('sans valeur actuelle : valorisé au montant investi ; réutilise le compte', () => {
    const v1 = addPrivateInvestment(makeVault(), { accountId: 'new', name: 'A', date: '2025-03-01', amount: 1000, today: '2026-10-30' });
    const v2 = addPrivateInvestment(v1, { accountId: v1.accounts[0].id, name: 'B', date: '2025-06-01', amount: 500, today: '2026-10-30' });
    expect(v2.accounts).toHaveLength(1);
    expect(buildEngine(v2, emptyPriceFile(), '2026-10-30').current.byClass.NON_COTE).toBe(1500);
  });
});
