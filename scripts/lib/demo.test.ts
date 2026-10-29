import { describe, it, expect } from 'vitest';
import { demoVault } from './demo';
import { parseVault } from '../../src/core/schema';

describe('demo', () => {
  it('valide et couvre toutes les catégories', () => {
    const v = parseVault(demoVault('2026-10-29'));
    expect(new Set(v.accounts.map((a) => a.type))).toEqual(new Set(['PEA', 'CTO', 'ASSURANCE_VIE', 'LIVRET_A', 'LDDS', 'COMPTE_COURANT', 'CRYPTO']));
    expect(v.realEstate).toHaveLength(1);
    expect(v.loans).toHaveLength(2);
    expect(v.physicalAssets).toHaveLength(1);
    expect(v.dcaPlans.length).toBeGreaterThanOrEqual(3);
  });
});
