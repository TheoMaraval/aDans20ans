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
