import { describe, it, expect } from 'vitest';
import { parseVault } from './schema';
import { emptyVault } from './defaults';

describe('schema', () => {
  it('accepte un vault vide', () => { expect(parseVault(emptyVault()).accounts).toEqual([]); });
  it('applique les valeurs par défaut', () => {
    const v = parseVault({ ...emptyVault(), accounts: [{ id: 'a', name: 'PEA', type: 'PEA' }] });
    expect(v.accounts[0].currency).toBe('EUR');
  });
  it('rejette une transaction vers un compte inconnu', () => {
    const v = { ...emptyVault(), transactions: [{ id: 't', accountId: 'x', date: '2024-01-01', type: 'DEPOSIT', amount: 10 }] };
    expect(() => parseVault(v)).toThrow(/compte inconnu/);
  });
  it('rejette un BUY sans instrument', () => {
    const v = { ...emptyVault(), accounts: [{ id: 'a', name: 'A', type: 'CTO' }],
      transactions: [{ id: 't', accountId: 'a', date: '2024-01-01', type: 'BUY', quantity: 1, unitPrice: 1 }] };
    expect(() => parseVault(v)).toThrow(/instrument/);
  });
  it('rejette une version inconnue', () => { expect(() => parseVault({ ...emptyVault(), version: 2 })).toThrow(); });
});
