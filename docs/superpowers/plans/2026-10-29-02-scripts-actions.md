# Plan 2/3 — Scripts, mail hebdo et GitHub Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Fournir les scripts Node qui créent le vault chiffré, rafraîchissent les cours (Yahoo, CoinGecko, BCE) et envoient le mail hebdo, ainsi que les workflows GitHub qui les orchestrent et déploient le site.

**Architecture :** `scripts/lib/*` contient des fonctions pures testables : les fournisseurs prennent un `fetch` injecté, la fusion des cours et le rendu du mail sont purs. Les points d'entrée `scripts/*.ts` ne font que l'I/O. On réutilise `src/core` (crypto, engine, report).

**Tech Stack :** Node 22 (`fetch` natif), tsx, nodemailer, GitHub Actions (`actions/deploy-pages@v4`).

**Prérequis :** Plan 1 terminé.

---

## Carte des fichiers

| Fichier | Rôle |
|---|---|
| `scripts/lib/files.ts` | Lecture et écriture des `.enc`, ouverture avec la passphrase |
| `scripts/lib/http.ts` | `fetchJson` avec timeout, User-Agent et erreurs lisibles |
| `scripts/lib/yahoo.ts` | Cours et clôtures quotidiennes Yahoo chart v8 |
| `scripts/lib/coingecko.ts` | Cours et historique crypto en EUR |
| `scripts/lib/fx.ts` | Taux BCE via Frankfurter |
| `scripts/lib/refresh.ts` | `refreshPrices` : fusion incrémentale dans `PriceFile` |
| `scripts/lib/email.ts` | Rendu HTML et texte du `WeeklyReport` |
| `scripts/lib/demo.ts` | Vault de démonstration réaliste |
| `scripts/init-vault.ts`, `refresh-prices.ts`, `weekly-report.ts` | Points d'entrée |
| `.github/workflows/*.yml` | CI, déploiement, cours, mail |

---

### Task 1 : I/O chiffrée et HTTP

**Files :** Create `scripts/lib/files.ts`, `scripts/lib/http.ts`, Test `scripts/lib/files.test.ts`

- [ ] **Step 1 : Test**

```ts
// file: scripts/lib/files.test.ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionKey } from '../../src/core/crypto';
import { emptyVault } from '../../src/core/defaults';
import { emptyPriceFile } from '../../src/core/prices';
import { openData, saveEncrypted } from './files';

describe('files', () => {
  it('écrit puis rouvre vault et prix', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fp-'));
    const sk = await createSessionKey('passphrase de test assez longue', 1000);
    await saveEncrypted(sk, join(dir, 'vault.enc'), emptyVault());
    const r = await openData('passphrase de test assez longue', dir);
    expect(r.vault.version).toBe(1);
    expect(r.prices).toEqual(emptyPriceFile());
    await saveEncrypted(r.sk, join(dir, 'prices.enc'), { ...emptyPriceFile(), updatedAt: 'x' });
    expect((await openData('passphrase de test assez longue', dir)).prices.updatedAt).toBe('x');
  });
  it('mauvaise passphrase', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fp-'));
    await saveEncrypted(await createSessionKey('aaaaaaaaaaaaaaaa', 1000), join(dir, 'vault.enc'), emptyVault());
    await expect(openData('bbbbbbbbbbbbbbbb', dir)).rejects.toThrow(/Passphrase/);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run scripts/lib/files.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// file: scripts/lib/files.ts
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decryptJson, encryptJson, isEnvelope, unlockSessionKey, type Envelope, type SessionKey } from '../../src/core/crypto';
import { parseVault } from '../../src/core/schema';
import { emptyPriceFile, type PriceFile } from '../../src/core/prices';
import type { Vault } from '../../src/core/types';

export const DATA_DIR = 'data';

export function readEnvelope(path: string): Envelope | null {
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  if (!isEnvelope(j)) throw new Error(`${path} n'est pas une enveloppe chiffrée valide`);
  return j;
}

export async function saveEncrypted(sk: SessionKey, path: string, data: unknown): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(await encryptJson(sk, data)) + '\n');
}

export interface OpenedData { sk: SessionKey; vault: Vault; prices: PriceFile }

/** Ouvre vault.enc (obligatoire) et prices.enc (vide si absent ou d'un autre sel). */
export async function openData(passphrase: string, dir = DATA_DIR): Promise<OpenedData> {
  const env = readEnvelope(join(dir, 'vault.enc'));
  if (!env) throw new Error(`${dir}/vault.enc introuvable : lancer « npm run init-vault »`);
  const sk = await unlockSessionKey(passphrase, env);
  const vault = parseVault(await decryptJson(sk, env));
  const penv = readEnvelope(join(dir, 'prices.enc'));
  let prices = emptyPriceFile();
  if (penv && penv.salt === sk.salt) prices = { ...emptyPriceFile(), ...(await decryptJson<PriceFile>(sk, penv)) };
  return { sk, vault, prices };
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement ${name} manquante`);
  return v;
}
```

```ts
// file: scripts/lib/http.ts
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

export async function fetchJson<T>(f: FetchLike, url: string, timeoutMs = 15000): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await f(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status} sur ${new URL(url).host}`);
    return (await r.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run scripts/lib/files.test.ts`. Attendu : PASS (2).

- [ ] **Step 5 : Commit**

```bash
git add scripts && git commit -m "feat(scripts): I/O chiffrée et utilitaire HTTP"
```

---

### Task 2 : Fournisseurs de cours

**Files :** Create `scripts/lib/yahoo.ts`, `scripts/lib/coingecko.ts`, `scripts/lib/fx.ts`, Test `scripts/lib/providers.test.ts`

- [ ] **Step 1 : Test** (réponses `fetch` simulées)

```ts
// file: scripts/lib/providers.test.ts
import { describe, it, expect } from 'vitest';
import { fetchYahoo } from './yahoo';
import { fetchCoingeckoQuotes, fetchCoingeckoHistory } from './coingecko';
import { fetchFx } from './fx';
import type { FetchLike } from './http';

const mock = (routes: Record<string, unknown>): FetchLike => async (url) => {
  const k = Object.keys(routes).find((p) => url.includes(p));
  if (!k) return new Response('nf', { status: 404 });
  return new Response(JSON.stringify(routes[k]), { status: 200 });
};
const ts = (d: string) => Date.parse(`${d}T07:00:00Z`) / 1000;

describe('yahoo', () => {
  it('cours, variation du jour, clôtures datées dans le fuseau du marché', async () => {
    const f = mock({ '/v8/finance/chart/CW8.PA': { chart: { result: [{
      meta: { currency: 'EUR', regularMarketPrice: 512, regularMarketTime: ts('2024-03-12') + 3600 * 8, gmtoffset: 3600 },
      timestamp: [ts('2024-03-08'), ts('2024-03-11'), ts('2024-03-12')],
      indicators: { quote: [{ close: [500, 505, null] }] },
    }], error: null } } });
    const r = await fetchYahoo(f, 'CW8.PA', '2024-03-01');
    expect(r.closes).toEqual({ '2024-03-08': 500, '2024-03-11': 505, '2024-03-12': 512 });
    expect(r.quote).toMatchObject({ price: 512, currency: 'EUR' });
    expect(r.quote.changePct1d).toBeCloseTo(512 / 505 - 1, 9);
  });
  it('convertit les pence (GBp)', async () => {
    const f = mock({ '/v8/finance/chart/VUSA.L': { chart: { result: [{
      meta: { currency: 'GBp', regularMarketPrice: 8000, regularMarketTime: ts('2024-03-12'), gmtoffset: 0 },
      timestamp: [ts('2024-03-11')], indicators: { quote: [{ close: [7900] }] },
    }] } } });
    const r = await fetchYahoo(f, 'VUSA.L', '2024-03-01');
    expect(r.quote).toMatchObject({ price: 80, currency: 'GBP' });
    expect(r.closes['2024-03-11']).toBe(79);
  });
  it('erreur Yahoo', async () => {
    const f = mock({ '/v8/finance/chart/': { chart: { result: null, error: { description: 'No data found' } } } });
    await expect(fetchYahoo(f, 'XXX', '2024-01-01')).rejects.toThrow(/No data/);
  });
});

describe('coingecko', () => {
  it('cours', async () => {
    const f = mock({ '/simple/price': { bitcoin: { eur: 60000, eur_24h_change: 2.5, last_updated_at: 1710000000 } } });
    const q = await fetchCoingeckoQuotes(f, ['bitcoin']);
    expect(q['cg:bitcoin']).toMatchObject({ price: 60000, currency: 'EUR', changePct1d: 0.025 });
  });
  it('historique', async () => {
    const f = mock({ '/coins/bitcoin/market_chart': { prices: [[Date.parse('2024-03-01T00:00:00Z'), 55000], [Date.parse('2024-03-02T00:00:00Z'), 56000]] } });
    expect(await fetchCoingeckoHistory(f, 'bitcoin', '2024-03-01', '2024-03-05')).toEqual({ '2024-03-01': 55000, '2024-03-02': 56000 });
  });
});

describe('fx', () => {
  it('inverse les taux BCE (EUR par unité)', async () => {
    const f = mock({ 'api.frankfurter.app/2024-03-01..': { rates: { '2024-03-01': { USD: 1.08 }, '2024-03-04': { USD: 1.085 } } } });
    const r = await fetchFx(f, ['USD'], '2024-03-01');
    expect(r.USD['2024-03-01']).toBeCloseTo(1 / 1.08, 9);
    expect(Object.keys(r.USD)).toHaveLength(2);
  });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run scripts/lib/providers.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// file: scripts/lib/yahoo.ts
import { toDate, type ISODate, type Series } from '../../src/core/dates';
import type { Quote } from '../../src/core/prices';
import { fetchJson, type FetchLike } from './http';

interface YahooChart {
  chart: {
    result: null | {
      meta: { currency: string; regularMarketPrice: number; regularMarketTime: number; gmtoffset: number };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
    error?: { description: string } | null;
  };
}

export interface YahooResult { quote: Quote; closes: Series }

export async function fetchYahoo(f: FetchLike, symbol: string, from: ISODate): Promise<YahooResult> {
  const p1 = Math.floor(toDate(from).getTime() / 1000);
  const p2 = Math.floor(Date.now() / 1000) + 86400;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=${p1}&period2=${p2}&interval=1d&includePrePost=false`;
  const j = await fetchJson<YahooChart>(f, url);
  const res = j.chart.result?.[0];
  if (!res) throw new Error(j.chart.error?.description ?? 'Réponse Yahoo vide');
  const m = res.meta;
  const pence = m.currency === 'GBp' || m.currency === 'GBX';
  const k = pence ? 0.01 : 1;
  const currency = pence ? 'GBP' : m.currency;
  const local = (t: number) => new Date((t + m.gmtoffset) * 1000).toISOString().slice(0, 10);
  const closes: Series = {};
  const ts = res.timestamp ?? [];
  const cl = res.indicators.quote[0]?.close ?? [];
  ts.forEach((t, i) => { const c = cl[i]; if (c != null && isFinite(c)) closes[local(t)] = c * k; });
  const price = m.regularMarketPrice * k;
  const today = local(m.regularMarketTime);
  closes[today] = price;
  const prev = Object.keys(closes).filter((d) => d < today).sort().at(-1);
  return {
    quote: { price, currency, asOf: new Date(m.regularMarketTime * 1000).toISOString(), changePct1d: prev ? price / closes[prev] - 1 : undefined },
    closes,
  };
}
```

```ts
// file: scripts/lib/coingecko.ts
import { daysBetween, type ISODate, type Series } from '../../src/core/dates';
import type { Quote } from '../../src/core/prices';
import { fetchJson, type FetchLike } from './http';

const API = 'https://api.coingecko.com/api/v3';

export async function fetchCoingeckoQuotes(f: FetchLike, ids: string[]): Promise<Record<string, Quote>> {
  if (!ids.length) return {};
  const j = await fetchJson<Record<string, { eur: number; eur_24h_change?: number; last_updated_at?: number }>>(
    f, `${API}/simple/price?ids=${ids.map(encodeURIComponent).join(',')}&vs_currencies=eur&include_24hr_change=true&include_last_updated_at=true`);
  const out: Record<string, Quote> = {};
  for (const id of ids) {
    const x = j[id];
    if (!x) continue;
    out[`cg:${id}`] = {
      price: x.eur, currency: 'EUR',
      asOf: new Date((x.last_updated_at ?? Date.now() / 1000) * 1000).toISOString(),
      changePct1d: x.eur_24h_change !== undefined ? x.eur_24h_change / 100 : undefined,
    };
  }
  return out;
}

/** L'API publique limite l'historique à 365 jours. */
export async function fetchCoingeckoHistory(f: FetchLike, id: string, from: ISODate, today: ISODate): Promise<Series> {
  const days = Math.min(365, Math.max(1, daysBetween(from, today) + 1));
  const j = await fetchJson<{ prices: [number, number][] }>(f, `${API}/coins/${encodeURIComponent(id)}/market_chart?vs_currency=eur&days=${days}&interval=daily`);
  const out: Series = {};
  for (const [t, p] of j.prices) out[new Date(t).toISOString().slice(0, 10)] = p;
  return out;
}
```

```ts
// file: scripts/lib/fx.ts
import type { ISODate, Series } from '../../src/core/dates';
import { fetchJson, type FetchLike } from './http';

/** Séries EUR par unité de devise, depuis `from`. */
export async function fetchFx(f: FetchLike, currencies: string[], from: ISODate): Promise<Record<string, Series>> {
  const list = currencies.filter((c) => c !== 'EUR');
  if (!list.length) return {};
  const j = await fetchJson<{ rates: Record<ISODate, Record<string, number>> }>(f, `https://api.frankfurter.app/${from}..?from=EUR&to=${list.join(',')}`);
  const out: Record<string, Series> = Object.fromEntries(list.map((c) => [c, {}]));
  for (const [d, rates] of Object.entries(j.rates)) for (const [c, r] of Object.entries(rates)) if (out[c] && r) out[c][d] = 1 / r;
  return out;
}
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run scripts/lib/providers.test.ts`. Attendu : PASS (6).

- [ ] **Step 5 : Commit**

```bash
git add scripts/lib && git commit -m "feat(scripts): fournisseurs Yahoo, CoinGecko, BCE"
```

---

### Task 3 : Fusion incrémentale des cours

**Files :** Create `scripts/lib/refresh.ts`, Test `scripts/lib/refresh.test.ts`

- [ ] **Step 1 : Test**

```ts
// file: scripts/lib/refresh.test.ts
import { describe, it, expect, vi } from 'vitest';
import { refreshPrices, collectTargets } from './refresh';
import { acc, inst, makeVault, prices, tx } from '../../src/core/test-fixtures';

const vault = makeVault({
  accounts: [acc({ id: 'cto', type: 'CTO' })],
  instruments: [inst({ id: 'aapl', yahooSymbol: 'AAPL', currency: 'USD' }), inst({ id: 'btc', coingeckoId: 'bitcoin', currency: 'EUR' }), inst({ id: 'x' })],
  transactions: [tx({ accountId: 'cto', date: '2024-01-10', type: 'BUY', instrumentId: 'aapl', quantity: 1, unitPrice: 180 })],
  dcaPlans: [{ id: 'd', name: 'BTC', accountId: 'cto', instrumentId: 'btc', amount: 50, frequency: 'MONTHLY', dayOfMonth: 1, startDate: '2024-02-01', fractional: true }],
});

describe('refresh', () => {
  it('collectTargets : premier usage par symbole, devises', () => {
    const t = collectTargets(vault);
    expect(t.yahoo).toEqual({ AAPL: '2024-01-10' });
    expect(t.coingecko).toEqual({ bitcoin: '2024-02-01' });
    expect(t.currencies).toEqual(['USD']);
    expect(t.earliest).toBe('2024-01-10');
  });
  it('fusionne, incrémental, isole les erreurs', async () => {
    const yahoo = vi.fn(async (s: string, from: string) => {
      if (s === 'AAPL') return { quote: { price: 190, currency: 'USD', asOf: 't' }, closes: { [from]: 1, '2024-03-01': 189 } };
      throw new Error('boom');
    });
    const prev = prices({ closes: { AAPL: { '2024-01-10': 180, '2024-02-20': 185 } } });
    const r = await refreshPrices(vault, prev, '2024-03-02', {
      yahoo, cgQuotes: async () => ({ 'cg:bitcoin': { price: 60000, currency: 'EUR', asOf: 't' } }),
      cgHistory: async () => ({ '2024-02-01': 40000 }), fx: async () => ({ USD: { '2024-03-01': 0.92 } }), pauseMs: 0,
    });
    expect(yahoo).toHaveBeenCalledWith('AAPL', '2024-02-13');
    expect(r.closes.AAPL).toMatchObject({ '2024-01-10': 180, '2024-02-20': 185, '2024-03-01': 189 });
    expect(r.quotes.AAPL.price).toBe(190);
    expect(r.quotes['cg:bitcoin'].price).toBe(60000);
    expect(r.closes['cg:bitcoin']['2024-02-01']).toBe(40000);
    expect(r.fx.USD).toBe(0.92);
    expect(r.errors).toEqual([]);
  });
  it('erreur d\'un fournisseur enregistrée sans bloquer', async () => {
    const r = await refreshPrices(vault, prices(), '2024-03-02', {
      yahoo: async () => { throw new Error('HTTP 404'); }, cgQuotes: async () => { throw new Error('HTTP 429'); }, cgHistory: async () => ({}), fx: async () => ({}), pauseMs: 0,
    });
    expect(r.errors.map((e) => e.symbol)).toEqual(['AAPL', 'bitcoin']);
  });
});
```

> Contrôle de l'appel incrémental : la dernière clôture connue est le 2024-02-20 ; on recharge à partir de J−7 (2024-02-13) pour couvrir les corrections de dernière minute.

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run scripts/lib/refresh.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// file: scripts/lib/refresh.ts
import { addDays, type ISODate, type Series } from '../../src/core/dates';
import type { PriceFile, Quote } from '../../src/core/prices';
import type { Vault } from '../../src/core/types';
import { sleep } from './http';

export interface Targets { yahoo: Record<string, ISODate>; coingecko: Record<string, ISODate>; currencies: string[]; earliest: ISODate | null }

export function collectTargets(v: Vault): Targets {
  const first = new Map<string, ISODate>();
  const bump = (id: string, d: ISODate) => { const x = first.get(id); if (!x || d < x) first.set(id, d); };
  for (const t of v.transactions) if (t.instrumentId) bump(t.instrumentId, t.date);
  for (const p of v.dcaPlans) bump(p.instrumentId, p.startDate);
  const yahoo: Record<string, ISODate> = {}, coingecko: Record<string, ISODate> = {};
  const cur = new Set<string>();
  for (const i of v.instruments) {
    const d = first.get(i.id);
    if (!d) continue;
    if (i.yahooSymbol) yahoo[i.yahooSymbol] = d;
    else if (i.coingeckoId) coingecko[i.coingeckoId] = d;
    cur.add(i.currency);
  }
  for (const a of v.accounts) cur.add(a.currency);
  cur.delete('EUR');
  const all = [...Object.values(yahoo), ...Object.values(coingecko)];
  return { yahoo, coingecko, currencies: [...cur].sort(), earliest: all.length ? all.reduce((m, d) => (d < m ? d : m)) : null };
}

export interface Fetchers {
  yahoo(symbol: string, from: ISODate): Promise<{ quote: Quote; closes: Series }>;
  cgQuotes(ids: string[]): Promise<Record<string, Quote>>;
  cgHistory(id: string, from: ISODate, today: ISODate): Promise<Series>;
  fx(currencies: string[], from: ISODate): Promise<Record<string, Series>>;
  pauseMs?: number;
}

const lastKey = (s: Series | undefined) => (s ? Object.keys(s).sort().at(-1) : undefined);
/** Reprise : 7 jours avant la dernière clôture connue, sinon 7 jours avant le premier usage. */
const resumeFrom = (s: Series | undefined, first: ISODate) => addDays(lastKey(s) ?? first, -7);

export async function refreshPrices(v: Vault, prev: PriceFile, today: ISODate, f: Fetchers): Promise<PriceFile> {
  const t = collectTargets(v);
  const out: PriceFile = {
    updatedAt: new Date().toISOString(),
    quotes: { ...prev.quotes }, fx: { ...prev.fx },
    closes: { ...prev.closes }, fxCloses: { ...prev.fxCloses }, errors: [],
  };
  const err = (symbol: string, e: unknown) => out.errors.push({ symbol, message: e instanceof Error ? e.message : String(e), at: out.updatedAt });

  for (const [sym, first] of Object.entries(t.yahoo)) {
    try {
      const r = await f.yahoo(sym, resumeFrom(prev.closes[sym], first));
      out.closes[sym] = { ...prev.closes[sym], ...r.closes };
      out.quotes[sym] = r.quote;
    } catch (e) { err(sym, e); }
    if (f.pauseMs) await sleep(f.pauseMs);
  }

  const ids = Object.keys(t.coingecko);
  if (ids.length) {
    try { Object.assign(out.quotes, await f.cgQuotes(ids)); } catch (e) { ids.forEach((id) => err(id, e)); }
    for (const id of ids) {
      const key = `cg:${id}`;
      try {
        const h = await f.cgHistory(id, resumeFrom(prev.closes[key], t.coingecko[id]), today);
        out.closes[key] = { ...prev.closes[key], ...h };
      } catch (e) { if (!out.errors.some((x) => x.symbol === id)) err(id, e); }
      if (f.pauseMs) await sleep(f.pauseMs);
    }
  }

  if (t.currencies.length && t.earliest) {
    const from = t.currencies.map((c) => resumeFrom(prev.fxCloses[c], t.earliest!)).reduce((m, d) => (d < m ? d : m));
    try {
      const r = await f.fx(t.currencies, from);
      for (const [c, s] of Object.entries(r)) {
        out.fxCloses[c] = { ...prev.fxCloses[c], ...s };
        const k = lastKey(out.fxCloses[c]);
        if (k) out.fx[c] = out.fxCloses[c][k];
      }
    } catch (e) { err('FX', e); }
  }
  return out;
}
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run scripts/lib/refresh.test.ts`. Attendu : PASS (3).

- [ ] **Step 5 : Commit**

```bash
git add scripts/lib && git commit -m "feat(scripts): fusion incrémentale des cours"
```

---

### Task 4 : Rendu du mail

**Files :** Create `scripts/lib/email.ts`, Test `scripts/lib/email.test.ts`

- [ ] **Step 1 : Test**

```ts
// file: scripts/lib/email.test.ts
import { describe, it, expect } from 'vitest';
import { renderEmail } from './email';
import type { WeeklyReport } from '../../src/core/report';

const report: WeeklyReport = {
  date: '2024-03-31', net: 123456.78, gross: 150000, debts: 26543.22,
  changes: [{ label: 'Semaine', change: 1000, flows: 200, changeExFlows: 800, pct: 0.0065 }, { label: 'Mois', change: -500, flows: 0, changeExFlows: -500, pct: -0.004 }, { label: 'Depuis le 1er janvier', change: 5000, flows: 1000, changeExFlows: 4000, pct: null }],
  weekly: Array.from({ length: 12 }, (_, k) => ({ date: `2024-01-${String(k + 1).padStart(2, '0')}`, net: 100000 + k * 1000 })),
  allocation: [{ cls: 'ACTIONS', actual: 0.6, target: 0.7 }, { cls: 'CASH', actual: 0.4 }],
  top: [{ instrumentId: 'a', name: 'Apple <Inc>', pct: 0.08, value: 1000 }], flop: [],
  alerts: [{ id: 'x', family: 'CEILING', level: 'critical', title: 'Livret A plein', detail: '22 950 €' }],
  dcaThisWeek: [{ planName: 'CW8', date: '2024-03-25', amount: 200 }], dcaNextWeek: [], pending: [],
  pricesUpdatedAt: '2024-03-31T17:00:00Z', priceErrors: 0,
};

describe('email', () => {
  const m = renderEmail(report, 'https://moi.github.io/finaryPerso/');
  it('objet', () => { expect(m.subject).toBe('Patrimoine · semaine du 31/03/2024 · 123 457 € (+0,7 %)'); });
  it('html : sections, échappement, lien', () => {
    expect(m.html).toContain('Positions à surveiller');
    expect(m.html).toContain('Livret A plein');
    expect(m.html).toContain('Apple &lt;Inc&gt;');
    expect(m.html).not.toContain('<Inc>');
    expect(m.html).toContain('https://moi.github.io/finaryPerso/');
    expect(m.html).toContain('cible 70');
  });
  it('texte brut', () => { expect(m.text).toContain('Patrimoine net : 123 457 €'); expect(m.text).toContain('[CRITIQUE] Livret A plein'); });
});
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run scripts/lib/email.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// file: scripts/lib/email.ts
import { ALERT_FAMILY_LABELS, type Alert } from '../../src/core/alerts';
import type { WeeklyReport } from '../../src/core/report';
import { ASSET_CLASS_LABELS } from '../../src/core/types';

const nbsp = (s: string) => s.replace(/[  ]/g, ' ');
export const eur = (x: number) => nbsp(`${Math.round(x).toLocaleString('fr-FR')} €`);
export const pct = (x: number | null) => (x === null ? 'n/d' : nbsp(`${x >= 0 ? '+' : ''}${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`));
const frDate = (d: string) => d.split('-').reverse().join('/');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const C = { bg: '#f4f5f7', card: '#ffffff', ink: '#111827', mute: '#6b7280', line: '#e5e7eb', up: '#047857', down: '#b91c1c', accent: '#4f46e5', warn: '#b45309' };
const color = (x: number | null) => (x === null ? C.mute : x >= 0 ? C.up : C.down);
const LEVEL = { critical: { label: 'CRITIQUE', c: C.down }, warn: { label: 'À SURVEILLER', c: C.warn }, info: { label: 'INFO', c: C.mute } } as const;

const section = (title: string, body: string) =>
  `<tr><td style="padding:20px 24px 4px;font:600 13px/1.4 system-ui,sans-serif;color:${C.mute};text-transform:uppercase;letter-spacing:.04em">${title}</td></tr>
   <tr><td style="padding:4px 24px 12px;font:14px/1.5 system-ui,sans-serif;color:${C.ink}">${body}</td></tr>`;
const row = (l: string, r: string, rc = C.ink) =>
  `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.line}">${l}</td><td style="padding:6px 0;border-bottom:1px solid ${C.line};text-align:right;color:${rc};white-space:nowrap">${r}</td></tr>`;
const table = (rows: string) => `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>`;

function alertsBlock(alerts: Alert[]): string {
  if (!alerts.length) return `<span style="color:${C.up}">Rien à signaler cette semaine.</span>`;
  const groups = new Map<string, Alert[]>();
  for (const a of alerts) groups.set(a.family, [...(groups.get(a.family) ?? []), a]);
  return [...groups].map(([fam, xs]) => `<div style="margin:8px 0 4px;font-weight:600">${ALERT_FAMILY_LABELS[fam as Alert['family']]}</div>` +
    xs.map((a) => `<div style="margin:4px 0;padding:8px 10px;border-left:3px solid ${LEVEL[a.level].c};background:${C.bg}">
      <span style="font-size:11px;font-weight:700;color:${LEVEL[a.level].c}">${LEVEL[a.level].label}</span><br>
      <b>${esc(a.title)}</b><br><span style="color:${C.mute}">${esc(a.detail)}</span></div>`).join('')).join('');
}

export function renderEmail(r: WeeklyReport, url: string): { subject: string; html: string; text: string } {
  const w = r.changes[0];
  const subject = `Patrimoine · semaine du ${frDate(r.date)} · ${eur(r.net)} (${pct(w.pct)})`;
  const max = Math.max(...r.weekly.map((x) => x.net)), min = Math.min(...r.weekly.map((x) => x.net));
  const bars = r.weekly.map((x) => {
    const h = max === min ? 40 : 8 + Math.round(((x.net - min) / (max - min)) * 52);
    return `<td valign="bottom" style="padding:0 2px"><div title="${frDate(x.date)} : ${eur(x.net)}" style="height:${h}px;background:${C.accent};border-radius:3px 3px 0 0"></div></td>`;
  }).join('');
  const movers = (xs: WeeklyReport['top']) => xs.length ? table(xs.map((m) => row(esc(m.name), pct(m.pct), color(m.pct))).join('')) : `<span style="color:${C.mute}">—</span>`;
  const dca = (xs: WeeklyReport['dcaThisWeek']) => xs.length ? table(xs.map((d) => row(`${esc(d.planName)} · ${frDate(d.date)}`, eur(d.amount))).join('')) : `<span style="color:${C.mute}">Aucun</span>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${C.bg}"><table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border-radius:12px">
<tr><td style="padding:24px 24px 0;font:13px system-ui,sans-serif;color:${C.mute}">Semaine du ${frDate(r.date)}</td></tr>
<tr><td style="padding:4px 24px 0;font:700 32px/1.2 system-ui,sans-serif;color:${C.ink}">${eur(r.net)}</td></tr>
<tr><td style="padding:2px 24px 0;font:14px system-ui,sans-serif;color:${C.mute}">Brut ${eur(r.gross)} · Dettes ${eur(r.debts)}</td></tr>
${section('Évolution', table(r.changes.map((c) => row(`${c.label}<br><span style="color:${C.mute};font-size:12px">hors apports (${eur(c.flows)} apportés)</span>`, `${c.change >= 0 ? '+' : ''}${eur(c.change)}<br><span style="font-size:12px">${c.changeExFlows >= 0 ? '+' : ''}${eur(c.changeExFlows)} · ${pct(c.pct)}</span>`, color(c.changeExFlows))).join('')) +
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;height:64px"><tr>${bars}</tr></table><div style="font-size:12px;color:${C.mute}">Patrimoine net, 12 dernières semaines</div>`)}
${section('Répartition', table(r.allocation.map((a) => row(ASSET_CLASS_LABELS[a.cls], `${Math.round(a.actual * 100)} %${a.target !== undefined ? ` <span style="color:${C.mute}">(cible ${Math.round(a.target * 100)} %)</span>` : ''}`)).join('')))}
${section('Positions à surveiller', alertsBlock(r.alerts))}
${section('Meilleures performances (7 j)', movers(r.top))}
${section('Moins bonnes performances (7 j)', movers(r.flop))}
${section('DCA cette semaine', dca(r.dcaThisWeek))}
${section('DCA semaine prochaine', dca(r.dcaNextWeek))}
${section('Données', `Cours mis à jour le ${r.pricesUpdatedAt ? new Date(r.pricesUpdatedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'jamais'}${r.priceErrors ? ` · <span style="color:${C.down}">${r.priceErrors} erreur(s)</span>` : ''}${r.pending.length ? ` · ${r.pending.length} échéance(s) DCA sans cours` : ''}`)}
<tr><td align="center" style="padding:16px 24px 28px"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;background:${C.accent};color:#fff;border-radius:8px;text-decoration:none;font:600 14px system-ui,sans-serif">Ouvrir le dashboard</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    subject, '',
    `Patrimoine net : ${eur(r.net)} (brut ${eur(r.gross)}, dettes ${eur(r.debts)})`,
    ...r.changes.map((c) => `${c.label} : ${c.change >= 0 ? '+' : ''}${eur(c.change)} · hors apports ${pct(c.pct)}`), '',
    'Positions à surveiller :',
    ...(r.alerts.length ? r.alerts.map((a) => `- [${LEVEL[a.level].label}] ${a.title} — ${a.detail}`) : ['- Rien à signaler']), '',
    'Top 7 j : ' + (r.top.map((m) => `${m.name} ${pct(m.pct)}`).join(', ') || '—'),
    'Flop 7 j : ' + (r.flop.map((m) => `${m.name} ${pct(m.pct)}`).join(', ') || '—'), '',
    `DCA cette semaine : ${r.dcaThisWeek.map((d) => `${d.planName} ${eur(d.amount)}`).join(', ') || 'aucun'}`,
    `DCA semaine prochaine : ${r.dcaNextWeek.map((d) => `${d.planName} ${eur(d.amount)}`).join(', ') || 'aucun'}`, '', url,
  ].join('\n');
  return { subject, html, text };
}
```

- [ ] **Step 4 : Lancer**

Run : `npx vitest run scripts/lib/email.test.ts`. Attendu : PASS (3).

- [ ] **Step 5 : Commit**

```bash
git add scripts/lib && git commit -m "feat(scripts): rendu HTML/texte du mail hebdo"
```

---

### Task 5 : Vault de démo et points d'entrée

**Files :** Create `scripts/lib/demo.ts`, `scripts/init-vault.ts`, `scripts/refresh-prices.ts`, `scripts/weekly-report.ts`, Test `scripts/lib/demo.test.ts`

- [ ] **Step 1 : Test**

```ts
// file: scripts/lib/demo.test.ts
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
```

- [ ] **Step 2 : Lancer, vérifier l'échec**

Run : `npx vitest run scripts/lib/demo.test.ts`. Attendu : FAIL.

- [ ] **Step 3 : Implémenter**

```ts
// file: scripts/lib/demo.ts
import { addMonths, type ISODate } from '../../src/core/dates';
import { emptyVault } from '../../src/core/defaults';
import type { Vault } from '../../src/core/types';

/** Données fictives réalistes, ancrées sur `today` (≈ 3 ans d'historique). */
export function demoVault(today: ISODate): Vault {
  const y3 = addMonths(today, -36), y2 = addMonths(today, -24), y1 = addMonths(today, -12);
  const v = emptyVault();
  v.settings.targetAllocation = { ACTIONS: 0.45, IMMOBILIER: 0.3, CASH: 0.15, CRYPTO: 0.05, OBLIGATIONS: 0.05 };
  v.settings.emergencyFundAccountIds = ['livretA', 'ldds'];
  v.settings.alertThresholds.emergencyFundMin = 15000;
  v.accounts = [
    { id: 'pea', name: 'PEA Boursorama', type: 'PEA', institution: 'Boursorama', currency: 'EUR', openedAt: y3 },
    { id: 'cto', name: 'CTO Trade Republic', type: 'CTO', institution: 'Trade Republic', currency: 'EUR', openedAt: y2 },
    { id: 'av', name: 'Assurance-vie Linxea', type: 'ASSURANCE_VIE', institution: 'Linxea', currency: 'EUR', openedAt: y3, balanceHistory: [{ date: y3, balance: 5000 }, { date: y1, balance: 8200 }] },
    { id: 'livretA', name: 'Livret A', type: 'LIVRET_A', institution: 'Banque', currency: 'EUR', interestRate: 0.024, balanceHistory: [{ date: y3, balance: 15000 }, { date: y1, balance: 21500 }] },
    { id: 'ldds', name: 'LDDS', type: 'LDDS', institution: 'Banque', currency: 'EUR', interestRate: 0.024, balanceHistory: [{ date: y2, balance: 6000 }] },
    { id: 'cc', name: 'Compte courant', type: 'COMPTE_COURANT', institution: 'Banque', currency: 'EUR', balanceHistory: [{ date: y3, balance: 2500 }, { date: addMonths(today, -1), balance: 3200 }] },
    { id: 'crypto', name: 'Ledger (manuel)', type: 'CRYPTO', currency: 'EUR', openedAt: y2 },
  ];
  v.instruments = [
    { id: 'cw8', name: 'Amundi MSCI World', kind: 'ETF', assetClass: 'ACTIONS', currency: 'EUR', yahooSymbol: 'CW8.PA', isin: 'LU1681043599' },
    { id: 'ese', name: 'BNP S&P 500', kind: 'ETF', assetClass: 'ACTIONS', currency: 'EUR', yahooSymbol: 'ESE.PA', isin: 'FR0011550185' },
    { id: 'aapl', name: 'Apple', kind: 'STOCK', assetClass: 'ACTIONS', currency: 'USD', yahooSymbol: 'AAPL' },
    { id: 'mc', name: 'LVMH', kind: 'STOCK', assetClass: 'ACTIONS', currency: 'EUR', yahooSymbol: 'MC.PA' },
    { id: 'btc', name: 'Bitcoin', kind: 'CRYPTO', assetClass: 'CRYPTO', currency: 'EUR', coingeckoId: 'bitcoin' },
    { id: 'eth', name: 'Ethereum', kind: 'CRYPTO', assetClass: 'CRYPTO', currency: 'EUR', coingeckoId: 'ethereum' },
  ];
  v.transactions = [
    { id: 'd1', accountId: 'pea', date: y3, type: 'DEPOSIT', amount: 10000 },
    { id: 'b1', accountId: 'pea', date: y3, type: 'BUY', instrumentId: 'cw8', quantity: 20, unitPrice: 380, fees: 1.9 },
    { id: 'b2', accountId: 'pea', date: y3, type: 'BUY', instrumentId: 'mc', quantity: 3, unitPrice: 640, fees: 1.9 },
    { id: 'd2', accountId: 'cto', date: y2, type: 'DEPOSIT', amount: 3000 },
    { id: 'b3', accountId: 'cto', date: y2, type: 'BUY', instrumentId: 'aapl', quantity: 10, unitPrice: 170, fees: 1 },
    { id: 'dv1', accountId: 'cto', date: y1, type: 'DIVIDEND', instrumentId: 'aapl', amount: 2.1 },
    { id: 'd3', accountId: 'crypto', date: y2, type: 'DEPOSIT', amount: 2000 },
    { id: 'b4', accountId: 'crypto', date: y2, type: 'BUY', instrumentId: 'eth', quantity: 1, unitPrice: 1700 },
  ];
  v.dcaPlans = [
    { id: 'dca-cw8', name: 'MSCI World mensuel', accountId: 'pea', instrumentId: 'cw8', amount: 300, frequency: 'MONTHLY', dayOfMonth: 5, startDate: y2, fractional: false, expectedAnnualReturn: 0.07 },
    { id: 'dca-ese', name: 'S&P 500 mensuel', accountId: 'pea', instrumentId: 'ese', amount: 150, frequency: 'MONTHLY', dayOfMonth: 5, startDate: y1, fractional: false, expectedAnnualReturn: 0.08 },
    { id: 'dca-btc', name: 'Bitcoin hebdo', accountId: 'crypto', instrumentId: 'btc', amount: 25, frequency: 'WEEKLY', dayOfWeek: 1, startDate: y1, fractional: true, feesPct: 0.01, expectedAnnualReturn: 0.1 },
  ];
  v.loans = [
    { id: 'pret-rp', name: 'Prêt résidence principale', kind: 'IMMOBILIER', principal: 180000, annualRate: 0.0135, durationMonths: 300, startDate: addMonths(y3, 1), insuranceMonthly: 25, ownershipPct: 1 },
    { id: 'pret-auto', name: 'Crédit auto', kind: 'AUTO', principal: 12000, annualRate: 0.049, durationMonths: 48, startDate: addMonths(y2, 1), ownershipPct: 1 },
  ];
  v.realEstate = [{ id: 'rp', name: 'Appartement Lyon 7e', kind: 'RESIDENCE_PRINCIPALE', surfaceM2: 58, purchaseDate: y3, purchasePrice: 225000, notaryFees: 17000, ownershipPct: 1, valuations: [{ date: y1, value: 232000, source: 'estimation agence' }], loanIds: ['pret-rp'] }];
  v.physicalAssets = [{ id: 'car', name: 'Peugeot 208', kind: 'VEHICULE', purchaseDate: y2, purchasePrice: 19500, depreciation: { model: 'DEGRESSIVE', annualRate: 0.15 }, valuations: [], loanIds: ['pret-auto'] }];
  v.priceAlerts = [{ id: 'al1', instrumentId: 'btc', condition: 'PRICE_BELOW', threshold: 50000, note: 'renforcer', active: true }];
  return v;
}
```

```ts
// file: scripts/init-vault.ts
// Usage : npm run init-vault  |  npm run demo   (VAULT_PASSPHRASE peut être fourni par l'environnement)
import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import { createSessionKey } from '../src/core/crypto';
import { emptyVault } from '../src/core/defaults';
import { todayParis } from '../src/core/dates';
import { emptyPriceFile } from '../src/core/prices';
import { parseVault } from '../src/core/schema';
import { demoVault } from './lib/demo';
import { DATA_DIR, saveEncrypted } from './lib/files';

zxcvbnOptions.setOptions({ dictionary: common.dictionary, graphs: common.adjacencyGraphs });

async function main() {
  const demo = process.argv.includes('--demo');
  const force = process.argv.includes('--force');
  const vaultPath = join(DATA_DIR, 'vault.enc');
  if (existsSync(vaultPath) && !force) throw new Error(`${vaultPath} existe déjà (ajouter --force pour l'écraser)`);
  let pass = process.env.VAULT_PASSPHRASE;
  if (!pass) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    pass = await rl.question('Passphrase (≥ 16 caractères, plusieurs mots) : ');
    const again = await rl.question('Confirmer : ');
    rl.close();
    if (pass !== again) throw new Error('Les passphrases ne correspondent pas');
  }
  if (pass.length < 16 || zxcvbn(pass).score < 3) throw new Error('Passphrase trop faible : au moins 16 caractères et score zxcvbn ≥ 3');
  const sk = await createSessionKey(pass);
  const vault = parseVault(demo ? demoVault(todayParis()) : emptyVault());
  await saveEncrypted(sk, vaultPath, vault);
  await saveEncrypted(sk, join(DATA_DIR, 'prices.enc'), emptyPriceFile());
  console.log(`✔ ${vaultPath} et prices.enc créés${demo ? ' (données de démo)' : ''}. Pensez au secret GitHub VAULT_PASSPHRASE.`);
}
main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
```

```ts
// file: scripts/refresh-prices.ts
import { join } from 'node:path';
import { todayParis } from '../src/core/dates';
import { fetchCoingeckoHistory, fetchCoingeckoQuotes } from './lib/coingecko';
import { DATA_DIR, openData, requireEnv, saveEncrypted } from './lib/files';
import { fetchFx } from './lib/fx';
import { refreshPrices } from './lib/refresh';
import { fetchYahoo } from './lib/yahoo';

async function main() {
  const { sk, vault, prices } = await openData(requireEnv('VAULT_PASSPHRASE'));
  const today = todayParis();
  const f = globalThis.fetch;
  const next = await refreshPrices(vault, prices, today, {
    yahoo: (s, from) => fetchYahoo(f, s, from),
    cgQuotes: (ids) => fetchCoingeckoQuotes(f, ids),
    cgHistory: (id, from, t) => fetchCoingeckoHistory(f, id, from, t),
    fx: (c, from) => fetchFx(f, c, from),
    pauseMs: 300,
  });
  await saveEncrypted(sk, join(DATA_DIR, 'prices.enc'), next);
  console.log(`✔ ${Object.keys(next.quotes).length} cotations, ${next.errors.length} erreur(s)`);
  for (const e of next.errors) console.warn(`  ⚠ ${e.symbol} : ${e.message}`);
}
main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
```

```ts
// file: scripts/weekly-report.ts
// Usage : npm run weekly-report [-- --dry-run]   (dry-run : écrit report.html, n'envoie rien)
import { writeFileSync } from 'node:fs';
import nodemailer from 'nodemailer';
import { todayParis } from '../src/core/dates';
import { buildEngine } from '../src/core/engine';
import { buildWeeklyReport } from '../src/core/report';
import { renderEmail } from './lib/email';
import { openData, requireEnv } from './lib/files';

async function main() {
  const dry = process.argv.includes('--dry-run');
  const { vault, prices } = await openData(requireEnv('VAULT_PASSPHRASE'));
  const [owner, repo] = (process.env.GITHUB_REPOSITORY ?? `${vault.settings.github.owner}/${vault.settings.github.repo}`).split('/');
  const url = process.env.DASHBOARD_URL ?? (owner && repo ? `https://${owner.toLowerCase()}.github.io/${repo}/` : '');
  const mail = renderEmail(buildWeeklyReport(buildEngine(vault, prices, todayParis())), url);
  if (dry) { writeFileSync('report.html', mail.html); console.log(`✔ report.html écrit — ${mail.subject}`); return; }
  const port = Number(process.env.SMTP_PORT ?? 465);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465,
    auth: { user: requireEnv('SMTP_USER'), pass: requireEnv('SMTP_PASS') },
  });
  await transport.sendMail({ from: `Patrimoine <${requireEnv('SMTP_USER')}>`, to: requireEnv('MAIL_TO'), subject: mail.subject, html: mail.html, text: mail.text });
  console.log(`✔ Mail envoyé : ${mail.subject}`);
}
main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
```

Ajouter `report.html` au `.gitignore`.

- [ ] **Step 4 : Lancer et essayer**

Run : `npx vitest run scripts && npx tsc --noEmit`. Attendu : PASS.

Essai réel dans un dossier temporaire, pour ne pas toucher `data/` :

```bash
VAULT_PASSPHRASE='demo correct horse battery staple' npx tsx scripts/init-vault.ts --demo
VAULT_PASSPHRASE='demo correct horse battery staple' npx tsx scripts/refresh-prices.ts
VAULT_PASSPHRASE='demo correct horse battery staple' npx tsx scripts/weekly-report.ts --dry-run
```

Attendu :
- l'init affiche « ✔ … créés (données de démo) » ;
- le refresh affiche environ 6 cotations et 0 erreur (sinon, noter les erreurs réseau) ;
- `report.html` s'ouvre dans le navigateur et montre toutes les sections.

Ensuite, supprimer `data/*.enc` : ce sont des données de démo, il ne faut pas les committer.

- [ ] **Step 5 : Commit**

```bash
git add scripts .gitignore && git commit -m "feat(scripts): init du vault, rafraîchissement des cours, mail hebdo"
```

---

### Task 6 : Workflows GitHub

**Files :** Create `.github/workflows/ci.yml`, `deploy.yml`, `refresh-prices.yml`, `weekly-report.yml`

- [ ] **Step 1 : Écrire les workflows**

```yaml
# file: .github/workflows/ci.yml
name: CI
on:
  pull_request:
  push:
    branches-ignore: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

```yaml
# file: .github/workflows/deploy.yml
name: Déploiement
on:
  push:
    branches: [main]
  workflow_dispatch:
  workflow_call:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with: { ref: main }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - name: Build
        run: VITE_BASE="/${GITHUB_REPOSITORY#*/}/" npm run build
      - name: Copier les données chiffrées
        run: mkdir -p dist/data && cp data/*.enc dist/data/ 2>/dev/null || true
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.d.outputs.page_url }}
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```

```yaml
# file: .github/workflows/refresh-prices.yml
name: Cours
on:
  schedule:
    - cron: '*/30 6-21 * * 1-5'
    - cron: '0 */2 * * 0,6'
  workflow_dispatch:
permissions:
  contents: write
  pages: write
  id-token: write
concurrency:
  group: data-writer
  cancel-in-progress: false
jobs:
  refresh:
    runs-on: ubuntu-latest
    outputs:
      changed: ${{ steps.commit.outputs.changed }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run refresh-prices
        env:
          VAULT_PASSPHRASE: ${{ secrets.VAULT_PASSPHRASE }}
      - id: commit
        name: Commit si changement
        run: |
          git config user.name "patrimoine-bot"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          if git diff --quiet -- data/prices.enc; then echo "changed=false" >> "$GITHUB_OUTPUT"; exit 0; fi
          git add data/prices.enc
          git commit -m "chore(data): cours"
          for i in 1 2 3; do
            git pull --rebase -X theirs origin main && git push && break
            sleep $((i * 5))
          done
          echo "changed=true" >> "$GITHUB_OUTPUT"
  deploy:
    needs: refresh
    if: needs.refresh.outputs.changed == 'true'
    uses: ./.github/workflows/deploy.yml
```

```yaml
# file: .github/workflows/weekly-report.yml
name: Mail hebdo
on:
  schedule:
    - cron: '0 16 * * 0'
  workflow_dispatch:
permissions:
  contents: read
jobs:
  send:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run weekly-report
        env:
          VAULT_PASSPHRASE: ${{ secrets.VAULT_PASSPHRASE }}
          SMTP_HOST: ${{ secrets.SMTP_HOST }}
          SMTP_PORT: ${{ secrets.SMTP_PORT }}
          SMTP_USER: ${{ secrets.SMTP_USER }}
          SMTP_PASS: ${{ secrets.SMTP_PASS }}
          MAIL_TO: ${{ secrets.MAIL_TO }}
```

> **Notes :**
> - `git pull --rebase -X theirs` : `prices.enc` n'a qu'un écrivain, la version fraîche gagne. `vault.enc` n'est jamais modifié ici, donc pas de conflit possible.
> - Sur un repo public, GitHub désactive les crons après 60 jours sans activité. Les commits de cours suffisent à maintenir l'activité.

- [ ] **Step 2 : Valider la syntaxe**

Run : `npx --yes yaml-lint .github/workflows/*.yml`. Si l'outil est indisponible, lancer `node -e "for (const f of require('fs').readdirSync('.github/workflows')) require('yaml')"` ou relire les fichiers. Attendu : aucune erreur.

- [ ] **Step 3 : Commit**

```bash
git add .github && git commit -m "ci: workflows CI, déploiement Pages, cours, mail hebdo"
```

---

## Auto-revue (faite)

- **Couverture de la spec** : §9 (Task 6), §10 (Task 4), §11 « Échec SMTP » (Task 5, sortie en code 1), §13 étapes 2–3 (Task 5 et README au plan 3).
- **Cohérence** : `refreshPrices` utilise `PriceFile`, `Quote` et `Series` du plan 1 ; `renderEmail` consomme `WeeklyReport` (plan 1, Task 14) ; `openData` renvoie un `sk` qui partage le sel du vault, comme le requiert §8.
