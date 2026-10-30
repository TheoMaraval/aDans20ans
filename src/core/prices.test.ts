import { describe, it, expect } from 'vitest';
import { createPriceBook, priceKey } from './prices';
import { inst, prices, tx } from './test-fixtures';

const cw8 = inst({ id: 'cw8', yahooSymbol: 'CW8.PA' });
const btc = inst({ id: 'btc', coingeckoId: 'bitcoin', kind: 'CRYPTO', assetClass: 'CRYPTO' });
const scpi = inst({ id: 'scpi', manualPrice: [{ date: '2024-01-01', price: 200 }] });
const aapl = inst({ id: 'aapl', yahooSymbol: 'AAPL', currency: 'USD' });
const pf = prices({
  quotes: { 'CW8.PA': { price: 510, currency: 'EUR', asOf: '2024-03-10T15:00:00Z', changePct1d: 0.01 } },
  closes: { 'CW8.PA': { '2024-03-01': 500, '2024-03-04': 505 } },
  fx: { USD: 0.92 }, fxCloses: { USD: { '2024-03-01': 0.9 } },
});

describe('PriceBook', () => {
  it('priceKey', () => { expect(priceKey(cw8)).toBe('CW8.PA'); expect(priceKey(btc)).toBe('cg:bitcoin'); expect(priceKey(scpi)).toBeNull(); });
  it('cotation du jour, puis clôtures', () => {
    const b = createPriceBook(pf, [], '2024-03-10');
    expect(b.priceAt(cw8, '2024-03-10')).toMatchObject({ price: 510, source: 'quote' });
    expect(b.priceAt(cw8, '2024-03-02')).toMatchObject({ price: 500, source: 'close', asOf: '2024-03-01' });
    expect(b.changePct1d(cw8)).toBe(0.01);
  });
  it('le live prime sur la cotation', () => {
    const b = createPriceBook(pf, [], '2024-03-10', { 'CW8.PA': { price: 520, currency: 'EUR', asOf: 'now' } });
    expect(b.priceAt(cw8, '2024-03-10')?.source).toBe('live');
  });
  it('prix manuel puis prix de transaction', () => {
    const b = createPriceBook(pf, [tx({ accountId: 'a', date: '2024-02-01', type: 'BUY', instrumentId: 'aapl', quantity: 1, unitPrice: 180 })], '2024-03-10');
    expect(b.priceAt(scpi, '2024-02-01')).toMatchObject({ price: 200, source: 'manual' });
    expect(b.priceAt(aapl, '2024-02-15')).toMatchObject({ price: 180, source: 'transaction' });
    expect(b.priceAt(aapl, '2024-01-15')).toBeNull();
  });
  it('devises', () => {
    const b = createPriceBook(pf, [], '2024-03-10');
    expect(b.fxAt('EUR', '2020-01-01')).toBe(1);
    expect(b.fxAt('USD', '2024-03-10')).toBe(0.92);
    expect(b.fxAt('USD', '2024-03-02')).toBe(0.9);
  });
  it('clôture au jour ou au jour suivant', () => {
    const b = createPriceBook(pf, [], '2024-03-10');
    expect(b.closeOnOrAfter(cw8, '2024-03-02')).toMatchObject({ price: 505, asOf: '2024-03-04' });
    expect(b.closeOnOrAfter(cw8, '2024-03-08')).toMatchObject({ price: 510, source: 'quote' });
    expect(b.closeOnOrAfter(scpi, '2024-02-01')).toMatchObject({ price: 200 });
  });
});

describe('PriceBook : ISIN et devise de cotation', () => {
  const mrna = inst({ id: 'mrna', kind: 'STOCK', isin: 'US60770K1079' });
  const pf2 = prices({
    symbols: { US60770K1079: 'MRNA' },
    quotes: { MRNA: { price: 200, currency: 'USD', asOf: '2024-03-10T20:00:00Z' } },
    closes: { MRNA: { '2024-03-01': 100 } },
    fx: { USD: 0.9 }, fxCloses: { USD: { '2024-03-01': 0.8 } },
  });
  const b = createPriceBook(pf2, [], '2024-03-10');
  it('symbole résolu depuis l\'ISIN', () => {
    expect(priceKey(mrna, pf2.symbols)).toBe('MRNA');
    expect(b.key(mrna)).toBe('MRNA');
  });
  it('cotation USD convertie en EUR (devise de l\'instrument)', () => {
    expect(b.priceAt(mrna, '2024-03-10')?.price).toBeCloseTo(180, 9);
    expect(b.priceAt(mrna, '2024-03-05')?.price).toBeCloseTo(80, 9);
  });
  it('un ticker saisi prime sur la résolution', () => {
    expect(priceKey({ ...mrna, yahooSymbol: 'MRNA.DE' }, pf2.symbols)).toBe('MRNA.DE');
  });
});

describe('variation du jour', () => {
  const us = inst({ id: 'us', yahooSymbol: 'IONQ', currency: 'EUR' });
  it('ignorée si la dernière cotation date d\'une séance précédente', () => {
    const pf3 = prices({ quotes: { IONQ: { price: 30, currency: 'EUR', asOf: '2026-10-29T20:00:00Z', changePct1d: -0.08 } } });
    expect(createPriceBook(pf3, [], '2026-10-30').changePct1d(us)).toBeUndefined();
    expect(createPriceBook(pf3, [], '2026-10-29').changePct1d(us)).toBe(-0.08);
  });
});
