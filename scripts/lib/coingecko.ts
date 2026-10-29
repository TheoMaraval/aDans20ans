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
