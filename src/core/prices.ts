import { addDays, firstOnOrAfter, lastEntryOnOrBefore, lastOnOrBefore, type ISODate, type Series } from './dates';
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
}

export const emptyPriceFile = (): PriceFile => ({ updatedAt: '', quotes: {}, fx: {}, closes: {}, fxCloses: {}, errors: [] });

export const priceKey = (i: Pick<Instrument, 'yahooSymbol' | 'coingeckoId'>): string | null =>
  i.yahooSymbol ?? (i.coingeckoId ? `cg:${i.coingeckoId}` : null);

export interface PricePoint { price: number; asOf: string; source: PriceSource }

export interface PriceBook {
  today: ISODate;
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
    if ((t.type === 'BUY' || t.type === 'SELL') && t.instrumentId && t.unitPrice !== undefined) {
      const s = txPrices.get(t.instrumentId) ?? {};
      s[t.date] = t.unitPrice;
      txPrices.set(t.instrumentId, s);
    }
  }
  const quoteFor = (i: Instrument): { q: Quote; source: PriceSource } | null => {
    const k = priceKey(i);
    if (!k) return null;
    if (live[k]) return { q: live[k], source: 'live' };
    if (pf.quotes[k]) return { q: pf.quotes[k], source: 'quote' };
    return null;
  };
  const fallback = (i: Instrument, date: ISODate): PricePoint | null => {
    const m = lastEntryOnOrBefore(i.manualPrice, date);
    if (m) return { price: m.price, asOf: m.date, source: 'manual' };
    const t = lastOnOrBefore(txPrices.get(i.id), date);
    return t ? { price: t.value, asOf: t.date, source: 'transaction' } : null;
  };

  return {
    today,
    priceAt(i, date) {
      if (date >= today) {
        const q = quoteFor(i);
        if (q) return { price: q.q.price, asOf: q.q.asOf, source: q.source };
      }
      const k = priceKey(i);
      const c = k ? lastOnOrBefore(pf.closes[k], date) : null;
      if (c) return { price: c.value, asOf: c.date, source: 'close' };
      return fallback(i, date);
    },
    closeOnOrAfter(i, date, maxDays = 7) {
      const k = priceKey(i);
      if (!k) return fallback(i, date);
      const limit = addDays(date, maxDays);
      const c = firstOnOrAfter(pf.closes[k], date);
      if (c && c.date <= limit) return { price: c.value, asOf: c.date, source: 'close' };
      const q = quoteFor(i);
      const qd = q?.q.asOf.slice(0, 10);
      if (q && qd && qd >= date && qd <= limit) return { price: q.q.price, asOf: q.q.asOf, source: q.source };
      return null;
    },
    fxAt(currency, date) {
      if (currency === 'EUR') return 1;
      if (date >= today && pf.fx[currency]) return pf.fx[currency];
      return lastOnOrBefore(pf.fxCloses[currency], date)?.value
        ?? firstOnOrAfter(pf.fxCloses[currency], date)?.value
        ?? pf.fx[currency] ?? 1;
    },
    changePct1d(i) { return quoteFor(i)?.q.changePct1d; },
  };
}
