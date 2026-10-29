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
