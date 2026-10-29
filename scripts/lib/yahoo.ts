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
