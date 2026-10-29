import { create } from 'zustand';
import { createSessionKey, decryptJson, encryptJson, unlockSessionKey, DEFAULT_ITER, type Envelope, type SessionKey } from '../../core/crypto';
import { emptyPriceFile, type PriceFile, type Quote } from '../../core/prices';
import { parseVault } from '../../core/schema';
import type { Vault } from '../../core/types';
import { commitFiles, getFile, repoFromLocation, putFile, type RepoRef } from '../services/github';
import { fetchPagesFile } from '../services/pages';
import { clearToken, loadToken, storeToken } from '../services/token';
import { toast } from './ui';

export type Status = 'boot' | 'new' | 'locked' | 'ready';

interface AppState {
  status: Status;
  vaultEnv?: Envelope; pricesEnv?: Envelope;
  sk?: SessionKey; vault?: Vault;
  /** JSON du vault tel que connu sur GitHub (détection de conflit) */
  baseJson?: string;
  prices: PriceFile; live: Record<string, Quote>;
  dirty: number; saving: boolean; token?: string; hide: boolean;
  conflict?: { remote: Vault };

  boot(): Promise<void>;
  unlock(pass: string): Promise<void>;
  createNew(pass: string, initial: Vault, iter?: number): Promise<void>;
  lock(force?: boolean): void;
  mutate(fn: (v: Vault) => void): void;
  replaceVault(v: Vault): void;
  save(): Promise<void>;
  resolveConflict(choice: 'overwrite' | 'reload'): Promise<void>;
  syncRemote(): Promise<void>;
  setToken(token?: string): Promise<void>;
  setHide(h: boolean): void;
  setLive(q: Record<string, Quote>): void;
  changePassphrase(pass: string): Promise<void>;
  repo(): RepoRef | null;
}

async function openPrices(sk: SessionKey, env?: Envelope): Promise<PriceFile> {
  if (!env || env.salt !== sk.salt) return emptyPriceFile();
  try { return { ...emptyPriceFile(), ...(await decryptJson<PriceFile>(sk, env)) }; } catch { return emptyPriceFile(); }
}

const VAULT = 'data/vault.enc';
const PRICES = 'data/prices.enc';

export const useApp = create<AppState>((set, get) => ({
  status: 'boot', prices: emptyPriceFile(), live: {}, dirty: 0, saving: false, hide: false,

  repo() {
    const g = get().vault?.settings.github;
    if (g?.owner && g.repo) return { owner: g.owner, repo: g.repo, branch: g.branch || 'main' };
    return typeof location !== 'undefined' ? repoFromLocation(location) : null;
  },

  async boot() {
    const [v, p] = await Promise.all([fetchPagesFile(VAULT), fetchPagesFile(PRICES)]);
    set({ vaultEnv: v ?? undefined, pricesEnv: p ?? undefined, status: v ? 'locked' : 'new' });
  },

  async unlock(pass) {
    const env = get().vaultEnv;
    if (!env) throw new Error('Aucun patrimoine à déverrouiller');
    const sk = await unlockSessionKey(pass, env);
    const vault = parseVault(await decryptJson(sk, env));
    const prices = await openPrices(sk, get().pricesEnv);
    const token = vault.settings.github.token || (await loadToken(sk));
    set({ sk, vault, baseJson: JSON.stringify(vault), prices, token, status: 'ready', dirty: 0, hide: vault.settings.hideAmountsByDefault });
    if (token) void get().syncRemote();
  },

  async createNew(pass, initial, iter = DEFAULT_ITER) {
    const sk = await createSessionKey(pass, iter);
    const vault = parseVault(initial);
    set({ sk, vault, baseJson: '', prices: emptyPriceFile(), status: 'ready', dirty: 1, hide: false, token: undefined });
  },

  lock(force = false) {
    if (!force && get().dirty > 0 && !confirm('Des modifications ne sont pas enregistrées. Verrouiller quand même ?')) return;
    set({ sk: undefined, vault: undefined, token: undefined, live: {}, prices: emptyPriceFile(), conflict: undefined, dirty: 0, baseJson: undefined, status: get().vaultEnv ? 'locked' : 'new' });
  },

  mutate(fn) {
    const next = structuredClone(get().vault!);
    fn(next);
    const parsed = parseVault(next);
    set((s) => ({ vault: parsed, dirty: s.dirty + 1 }));
  },

  replaceVault(v) { set((s) => ({ vault: parseVault(v), dirty: s.dirty + 1 })); },

  async save() {
    const { sk, vault, token } = get();
    const ref = get().repo();
    if (!sk || !vault) return;
    if (!token || !ref) { toast('err', 'Configure le dépôt et le token GitHub dans Réglages pour enregistrer.'); return; }
    set({ saving: true });
    try {
      const remote = await getFile(ref, token, VAULT);
      if (remote) {
        const env = JSON.parse(remote.text) as Envelope;
        const remoteVault = parseVault(await decryptJson(sk, env));
        if (JSON.stringify(remoteVault) !== get().baseJson) { set({ conflict: { remote: remoteVault } }); return; }
      }
      const env = await encryptJson(sk, vault);
      await putFile(ref, token, VAULT, JSON.stringify(env) + '\n', remote?.sha, 'chore(data): mise à jour du patrimoine');
      set({ baseJson: JSON.stringify(vault), dirty: 0, vaultEnv: env });
      toast('ok', 'Enregistré ✔ (en ligne d\'ici ~1 min)');
    } catch (e) {
      toast('err', e instanceof Error ? e.message : String(e));
    } finally {
      set({ saving: false });
    }
  },

  async resolveConflict(choice) {
    const c = get().conflict;
    if (!c) return;
    if (choice === 'reload') {
      set({ vault: c.remote, baseJson: JSON.stringify(c.remote), dirty: 0, conflict: undefined });
      toast('info', 'Version GitHub rechargée');
    } else {
      set({ baseJson: JSON.stringify(c.remote), conflict: undefined });
      await get().save();
    }
  },

  async syncRemote() {
    const { sk, token } = get();
    const ref = get().repo();
    if (!sk || !token || !ref) return;
    try {
      const [vf, pf] = await Promise.all([getFile(ref, token, VAULT), getFile(ref, token, PRICES)]);
      if (vf && get().dirty === 0) {
        const env = JSON.parse(vf.text) as Envelope;
        if (env.salt !== sk.salt) { toast('err', 'La passphrase a été changée sur un autre appareil : reverrouille.'); return; }
        const v = parseVault(await decryptJson(sk, env));
        set({ vault: v, baseJson: JSON.stringify(v), vaultEnv: env });
      }
      if (pf) {
        const env = JSON.parse(pf.text) as Envelope;
        set({ prices: await openPrices(sk, env), pricesEnv: env });
      }
    } catch (e) {
      toast('err', `Synchronisation GitHub : ${e instanceof Error ? e.message : e}`);
    }
  },

  async setToken(token) {
    const sk = get().sk;
    if (!sk) return;
    if (token) { await storeToken(sk, token); set({ token }); void get().syncRemote(); }
    else { clearToken(); set({ token: undefined }); }
  },

  setHide(h) { set({ hide: h }); },
  setLive(q) { set({ live: q }); },

  async changePassphrase(pass) {
    const { vault, prices, token } = get();
    const ref = get().repo();
    if (!vault || !token || !ref) throw new Error('Dépôt et token GitHub requis');
    const sk = await createSessionKey(pass);
    const venv = await encryptJson(sk, vault);
    const penv = await encryptJson(sk, prices);
    await commitFiles(ref, token, [
      { path: VAULT, text: JSON.stringify(venv) + '\n' },
      { path: PRICES, text: JSON.stringify(penv) + '\n' },
    ], 'chore(data): changement de passphrase');
    await storeToken(sk, token);
    set({ sk, vaultEnv: venv, pricesEnv: penv, baseJson: JSON.stringify(vault), dirty: 0 });
  },
}));
