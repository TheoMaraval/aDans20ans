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

describe('refresh : ISIN sans ticker', () => {
  const v = makeVault({
    accounts: [acc({ id: 'cto', type: 'CTO' })],
    instruments: [inst({ id: 'm', isin: 'US60770K1079', kind: 'STOCK' }), inst({ id: 'z', isin: 'XX0000000000', kind: 'STOCK' })],
    transactions: [
      tx({ accountId: 'cto', date: '2024-01-10', type: 'BUY', instrumentId: 'm', quantity: 1, unitPrice: 100 }),
      tx({ accountId: 'cto', date: '2024-01-10', type: 'BUY', instrumentId: 'z', quantity: 1, unitPrice: 1 }),
    ],
  });
  it('résout le ticker, récupère le cours et le taux de la devise de cotation', async () => {
    const fx = vi.fn(async () => ({ USD: { '2024-03-01': 0.9 } }));
    const r = await refreshPrices(v, prices(), '2024-03-02', {
      search: async (isin) => (isin === 'US60770K1079' ? 'MRNA' : null),
      yahoo: async () => ({ quote: { price: 200, currency: 'USD', asOf: 't' }, closes: { '2024-03-01': 199 } }),
      cgQuotes: async () => ({}), cgHistory: async () => ({}), fx, pauseMs: 0,
    });
    expect(r.symbols).toEqual({ US60770K1079: 'MRNA' });
    expect(r.quotes.MRNA.price).toBe(200);
    expect(fx).toHaveBeenCalledWith(['USD'], expect.any(String));
    expect(r.errors.map((e) => e.symbol)).toEqual(['XX0000000000']);
  });
  it('ne recherche pas un ISIN déjà résolu', async () => {
    const search = vi.fn(async () => 'X');
    await refreshPrices(v, { ...prices(), symbols: { US60770K1079: 'MRNA', XX0000000000: 'Z' } }, '2024-03-02', {
      search, yahoo: async () => ({ quote: { price: 1, currency: 'EUR', asOf: 't' }, closes: {} }),
      cgQuotes: async () => ({}), cgHistory: async () => ({}), fx: async () => ({}), pauseMs: 0,
    });
    expect(search).not.toHaveBeenCalled();
  });
});
