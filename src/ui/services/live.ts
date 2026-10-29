import type { Quote } from '../../core/prices';
import type { Vault } from '../../core/types';
import { fetchCoingeckoQuotes } from '../../../scripts/lib/coingecko';

/** Cours crypto en direct (CoinGecko autorise le CORS). */
export async function fetchLiveQuotes(v: Vault): Promise<Record<string, Quote>> {
  const ids = [...new Set(v.instruments.map((i) => i.coingeckoId).filter((x): x is string => !!x))];
  return fetchCoingeckoQuotes((url) => fetch(url), ids);
}

export async function searchCoingecko(q: string): Promise<{ id: string; name: string; symbol: string }[]> {
  const r = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(q)}`);
  if (!r.ok) return [];
  return ((await r.json()).coins ?? []).slice(0, 8);
}
