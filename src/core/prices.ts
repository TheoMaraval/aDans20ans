import { addDays, firstOnOrAfter, lastEntryOnOrBefore, lastOnOrBefore, todayParis, type ISODate, type Series } from './dates';
import type { Instrument, PriceSource, Transaction } from './types';

export interface Quote { price: number; currency: string; asOf: string; changePct1d?: number }

export interface PriceFile {
  updatedAt: string;
  quotes: Record<string, Quote>;
  /** EUR par unité de devise, dernier connu */
  fx: Record<string, number>;
  closes: Record<string, Series>;
  fxCloses: Record<string, Series>;
  errors: { symbol: string; message: string; at: string }[];
  /** Symbole Yahoo résolu automatiquement à partir de l'ISIN */
  symbols: Record<string, string>;
}

export const emptyPriceFile = (): PriceFile => ({ updatedAt: '', quotes: {}, fx: {}, closes: {}, fxCloses: {}, errors: [], symbols: {} });

/** Clé de cotation : ticker saisi, sinon identifiant CoinGecko, sinon symbole résolu depuis l'ISIN. */
export const priceKey = (i: Pick<Instrument, 'yahooSymbol' | 'coingeckoId' | 'isin'>, symbols: Record<string, string> = {}): string | null =>
  i.yahooSymbol ?? (i.coingeckoId ? `cg:${i.coingeckoId}` : (i.isin && symbols[i.isin]) || null);

export interface PricePoint { price: number; asOf: string; source: PriceSource }

export interface PriceBook {
  today: ISODate;
  /** Clé de cotation de l'instrument (null si aucune). */
  key(i: Instrument): string | null;
  /** Cours en devise de l'instrument, dernier connu à la date. */
  priceAt(i: Instrument, date: ISODate): PricePoint | null;
  /** Clôture du jour ou du premier jour de cotation suivant (≤ maxDays). */
  closeOnOrAfter(i: Instrument, date: ISODate, maxDays?: number): PricePoint | null;
  /** EUR par unité de devise. */
  fxAt(currency: string, date: ISODate): number;
  changePct1d(i: Instrument): number | undefined;
}

export function createPriceBook(pf: PriceFile, transactions: Transaction[], today: ISODate, live: Record<string, Quote> = {}): PriceBook {
  const txPrices = new Map<string, Series>();
  for (const t of transactions) {
    if ((t.type === 'BUY' || t.type === 'SELL') && t.instrumentId && t.unitPrice) {
      const s = txPrices.get(t.instrumentId) ?? {};
      s[t.date] = t.unitPrice;
      txPrices.set(t.instrumentId, s);
    }
  }
  const symbols = pf.symbols ?? {};
  const key = (i: Instrument) => priceKey(i, symbols);

  const fxAt = (currency: string, date: ISODate): number => {
    if (currency === 'EUR') return 1;
    if (date >= today && pf.fx[currency]) return pf.fx[currency];
    return lastOnOrBefore(pf.fxCloses[currency], date)?.value
      ?? firstOnOrAfter(pf.fxCloses[currency], date)?.value
      ?? pf.fx[currency] ?? 1;
  };
  /** Une cotation peut être dans une autre devise que l'instrument (ex. MRNA en USD, acheté en EUR) : on convertit. */
  const conv = (i: Instrument, k: string, price: number, date: ISODate): number => {
    const qc = live[k]?.currency ?? pf.quotes[k]?.currency;
    return !qc || qc === i.currency ? price : (price * fxAt(qc, date)) / fxAt(i.currency, date);
  };
  const quoteFor = (i: Instrument): { k: string; q: Quote; source: PriceSource } | null => {
    const k = key(i);
    if (!k) return null;
    if (live[k]) return { k, q: live[k], source: 'live' };
    if (pf.quotes[k]) return { k, q: pf.quotes[k], source: 'quote' };
    return null;
  };
  const fallback = (i: Instrument, date: ISODate): PricePoint | null => {
    const m = lastEntryOnOrBefore(i.manualPrice, date);
    if (m) return { price: m.price, asOf: m.date, source: 'manual' };
    const t = lastOnOrBefore(txPrices.get(i.id), date);
    return t ? { price: t.value, asOf: t.date, source: 'transaction' } : null;
  };

  return {
    today, key, fxAt,
    priceAt(i, date) {
      if (date >= today) {
        const q = quoteFor(i);
        if (q) return { price: conv(i, q.k, q.q.price, date), asOf: q.q.asOf, source: q.source };
      }
      const k = key(i);
      const c = k ? lastOnOrBefore(pf.closes[k], date) : null;
      if (k && c) return { price: conv(i, k, c.value, c.date), asOf: c.date, source: 'close' };
      return fallback(i, date);
    },
    closeOnOrAfter(i, date, maxDays = 7) {
      const k = key(i);
      if (!k) return fallback(i, date);
      const limit = addDays(date, maxDays);
      const c = firstOnOrAfter(pf.closes[k], date);
      if (c && c.date <= limit) return { price: conv(i, k, c.value, c.date), asOf: c.date, source: 'close' };
      const q = quoteFor(i);
      const qd = q?.q.asOf.slice(0, 10);
      if (q && qd && qd >= date && qd <= limit) return { price: conv(i, k, q.q.price, qd), asOf: q.q.asOf, source: q.source };
      return null;
    },
    changePct1d(i) {
      const q = quoteFor(i)?.q;
      if (!q) return undefined;
      // Une cotation d'une séance précédente (ex. actions US avant l'ouverture) ne bouge pas « aujourd'hui ».
      const d = new Date(q.asOf);
      return !isNaN(d.getTime()) && todayParis(d) < today ? undefined : q.changePct1d;
    },
  };
}
