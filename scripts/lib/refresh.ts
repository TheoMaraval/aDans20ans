import { addDays, type ISODate, type Series } from '../../src/core/dates';
import type { PriceFile, Quote } from '../../src/core/prices';
import type { Vault } from '../../src/core/types';
import { sleep } from './http';

export interface Targets { yahoo: Record<string, ISODate>; coingecko: Record<string, ISODate>; currencies: string[]; earliest: ISODate | null; unresolved: string[] }

/** `symbols` : ISIN → symbole Yahoo déjà résolu. */
export function collectTargets(v: Vault, symbols: Record<string, string> = {}): Targets {
  const first = new Map<string, ISODate>();
  const bump = (id: string, d: ISODate) => { const x = first.get(id); if (!x || d < x) first.set(id, d); };
  for (const t of v.transactions) if (t.instrumentId) bump(t.instrumentId, t.date);
  for (const p of v.dcaPlans) bump(p.instrumentId, p.startDate);
  const yahoo: Record<string, ISODate> = {}, coingecko: Record<string, ISODate> = {};
  const cur = new Set<string>();
  const unresolved: string[] = [];
  for (const i of v.instruments) {
    const d = first.get(i.id);
    if (!d) continue;
    const sym = i.yahooSymbol ?? (i.isin ? symbols[i.isin] : undefined);
    if (sym) yahoo[sym] = yahoo[sym] && yahoo[sym] < d ? yahoo[sym] : d;
    else if (i.coingeckoId) coingecko[i.coingeckoId] = d;
    else if (i.isin) unresolved.push(i.isin);
    cur.add(i.currency);
  }
  for (const a of v.accounts) cur.add(a.currency);
  cur.delete('EUR');
  const all = [...Object.values(yahoo), ...Object.values(coingecko)];
  return { yahoo, coingecko, currencies: [...cur].sort(), earliest: all.length ? all.reduce((m, d) => (d < m ? d : m)) : null, unresolved };
}

export interface Fetchers {
  yahoo(symbol: string, from: ISODate): Promise<{ quote: Quote; closes: Series }>;
  cgQuotes(ids: string[]): Promise<Record<string, Quote>>;
  cgHistory(id: string, from: ISODate, today: ISODate): Promise<Series>;
  fx(currencies: string[], from: ISODate): Promise<Record<string, Series>>;
  /** ISIN → symbole Yahoo (null si introuvable). */
  search?(isin: string): Promise<string | null>;
  pauseMs?: number;
}

const lastKey = (s: Series | undefined) => (s ? Object.keys(s).sort().at(-1) : undefined);
/** Reprise : 7 jours avant la dernière clôture connue, sinon 7 jours avant le premier usage. */
const resumeFrom = (s: Series | undefined, first: ISODate) => addDays(lastKey(s) ?? first, -7);

export async function refreshPrices(v: Vault, prev: PriceFile, today: ISODate, f: Fetchers): Promise<PriceFile> {
  const out: PriceFile = {
    updatedAt: new Date().toISOString(),
    quotes: { ...prev.quotes }, fx: { ...prev.fx },
    closes: { ...prev.closes }, fxCloses: { ...prev.fxCloses }, errors: [], symbols: { ...prev.symbols },
  };
  const err = (symbol: string, e: unknown) => out.errors.push({ symbol, message: e instanceof Error ? e.message : String(e), at: out.updatedAt });

  // Résolution des ISIN sans ticker (actifs importés de Trade Republic, par exemple).
  for (const isin of collectTargets(v, out.symbols).unresolved) {
    if (!f.search) break;
    try {
      const sym = await f.search(isin);
      if (sym) out.symbols[isin] = sym; else err(isin, "aucun ticker Yahoo trouvé : saisis-le dans l'actif");
    } catch (e) { err(isin, e); }
    if (f.pauseMs) await sleep(f.pauseMs);
  }
  const t = collectTargets(v, out.symbols);

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

  // Devises des instruments et des comptes, plus celles des cotations (ex. MRNA coté en USD pour un actif suivi en EUR).
  const currencies = [...new Set([...t.currencies, ...Object.keys(t.yahoo).map((s) => out.quotes[s]?.currency).filter((c): c is string => !!c && c !== 'EUR')])].sort();
  if (currencies.length && t.earliest) {
    const from = currencies.map((c) => resumeFrom(prev.fxCloses[c], t.earliest!)).reduce((m, d) => (d < m ? d : m));
    try {
      const r = await f.fx(currencies, from);
      for (const [c, s] of Object.entries(r)) {
        out.fxCloses[c] = { ...prev.fxCloses[c], ...s };
        const k = lastKey(out.fxCloses[c]);
        if (k) out.fx[c] = out.fxCloses[c][k];
      }
    } catch (e) { err('FX', e); }
  }
  return out;
}
