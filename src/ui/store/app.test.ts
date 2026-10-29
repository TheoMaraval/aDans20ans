import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSessionKey, encryptJson } from '../../core/crypto';
import { emptyVault } from '../../core/defaults';

vi.mock('../services/pages', () => ({ fetchPagesFile: vi.fn() }));
import { fetchPagesFile } from '../services/pages';
import { useApp } from './app';

describe('store app', () => {
  beforeEach(() => useApp.setState(useApp.getInitialState(), true));

  it('boot sans vault → new', async () => {
    vi.mocked(fetchPagesFile).mockResolvedValue(null);
    await useApp.getState().boot();
    expect(useApp.getState().status).toBe('new');
  });
  it('boot + unlock', async () => {
    const sk = await createSessionKey('une passphrase de test assez longue', 1000);
    const env = await encryptJson(sk, emptyVault());
    vi.mocked(fetchPagesFile).mockImplementation(async (n) => (n.includes('vault') ? env : null));
    await useApp.getState().boot();
    expect(useApp.getState().status).toBe('locked');
    await useApp.getState().unlock('une passphrase de test assez longue');
    expect(useApp.getState().status).toBe('ready');
    expect(useApp.getState().vault?.version).toBe(1);
  });
  it('token rangé dans le vault : retrouvé au déverrouillage sans stockage local', async () => {
    localStorage.clear();
    const sk = await createSessionKey('une passphrase de test assez longue', 1000);
    const v = emptyVault(); v.settings.github.token = 'github_pat_test';
    const env = await encryptJson(sk, v);
    vi.mocked(fetchPagesFile).mockImplementation(async (n) => (n.includes('vault') ? env : null));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));
    await useApp.getState().boot();
    await useApp.getState().unlock('une passphrase de test assez longue');
    expect(useApp.getState().token).toBe('github_pat_test');
    vi.unstubAllGlobals();
  });
  it('mutate valide et compte les modifs ; lock efface', async () => {
    await useApp.getState().createNew('une passphrase de test assez longue', emptyVault(), 1000);
    useApp.getState().mutate((v) => { v.accounts.push({ id: 'a', name: 'PEA', type: 'PEA', currency: 'EUR' }); });
    expect(useApp.getState().dirty).toBe(2);
    expect(() => useApp.getState().mutate((v) => { v.transactions.push({ id: 't', accountId: 'zz', date: '2024-01-01', type: 'DEPOSIT', amount: 1 }); })).toThrow(/compte inconnu/);
    expect(useApp.getState().vault?.transactions).toHaveLength(0);
    useApp.getState().lock(true);
    expect(useApp.getState().vault).toBeUndefined();
  });
});
