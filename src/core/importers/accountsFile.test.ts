import { describe, it, expect } from 'vitest';
import { applyAccountsFile, isAccountsFile, parseAccountsFile } from './accountsFile';
import { balanceAt } from '../savings';
import { acc, makeVault } from '../test-fixtures';

const FILE = JSON.stringify({
  format: 'patrimoine-comptes/1', date: '2026-10-30',
  accounts: [
    { name: 'Livret A', type: 'LIVRET_A', institution: 'Société Générale', balance: 125 },
    { name: 'Livret Jeune', type: 'LIVRET_JEUNE', institution: 'Société Générale', balance: 1798.61, interestRate: 0.024 },
  ],
});

describe('fichier de comptes', () => {
  it('reconnaît et valide le format', () => {
    expect(isAccountsFile(FILE)).toBe(true);
    expect(isAccountsFile('a,b\n1,2')).toBe(false);
    expect(() => parseAccountsFile(JSON.stringify({ format: 'patrimoine-comptes/1', accounts: [{ name: 'x', type: 'NIMP', balance: 1 }] }))).toThrow();
  });
  it('crée les comptes avec leur solde daté', () => {
    const r = applyAccountsFile(makeVault(), parseAccountsFile(FILE), '2026-10-31');
    expect(r.created).toEqual(['Livret A', 'Livret Jeune']);
    const lj = r.vault.accounts.find((a) => a.name === 'Livret Jeune')!;
    expect(lj).toMatchObject({ type: 'LIVRET_JEUNE', institution: 'Société Générale', interestRate: 0.024 });
    expect(balanceAt(lj, '2026-10-30')).toBe(1798.61);
  });
  it('met à jour le solde d\'un compte existant (même nom et établissement) sans doublon', () => {
    const v = makeVault({ accounts: [acc({ id: 'la', name: 'livret a', type: 'LIVRET_A', institution: 'Société Générale', balanceHistory: [{ date: '2026-01-01', balance: 50 }] })] });
    const r = applyAccountsFile(v, parseAccountsFile(FILE), '2026-10-31');
    expect(r.updated).toEqual(['Livret A']);
    expect(r.vault.accounts.filter((a) => a.type === 'LIVRET_A')).toHaveLength(1);
    expect(r.vault.accounts.find((a) => a.id === 'la')!.balanceHistory).toEqual([{ date: '2026-01-01', balance: 50 }, { date: '2026-10-30', balance: 125 }]);
  });
});
