import { describe, it, expect } from 'vitest';
import { applyKraken, defaultKrakenAccount, isKrakenBalances, parseKrakenBalances, type KrakenOptions } from './kraken';
import { buildEngine } from '../engine';
import { emptyPriceFile } from '../prices';
import { makeVault } from '../test-fixtures';
import type { Vault } from '../types';

const H = '"asset","aclass","subclass","wallet","quantity","price (USD)","value (USD)"';
const csv = (...rows: string[]) => [H, ...rows, '"Total","","","","","","999.00"', ''].join('\n');
const FILE = csv(
  '"XBT","currency","crypto","spot",0.5,"80,000.00","40,000.00"',
  '"ETH","currency","crypto","spot",1.0,"2,000.00","2,000.00"',
  '"ETH.S","currency","crypto","staked",0.5,"2,000.00","1,000.00"',
  '"PEPE","currency","crypto","spot","1,000,000.00",0.0000,"5.00"',
  '"ZEUR","currency","fiat","spot",150.5,1.0,150.5',
  '"FOO","currency","crypto","spot",3,1,3',
);

const opts = (o: Partial<KrakenOptions> = {}): KrakenOptions => ({
  accountId: 'new', date: '2026-10-28', prices: emptyPriceFile(),
  eurPrices: { BTC: 70000, ETH: 1800, PEPE: 0.0000045 },
  coingeckoIds: { BTC: 'bitcoin', ETH: 'ethereum', PEPE: 'pepe' }, ...o,
});
const qtyOf = (v: Vault, cg: string, date = '2026-10-28') => {
  const e = buildEngine(v, emptyPriceFile(), date);
  const i = v.instruments.find((x) => x.coingeckoId === cg)!;
  return e.current.positions.filter((p) => p.instrumentId === i.id).reduce((s, p) => s + p.quantity, 0);
};

describe('Kraken : lecture', () => {
  it('reconnaît le format', () => {
    expect(isKrakenBalances(FILE)).toBe(true);
    expect(isKrakenBalances('a,b\n1,2')).toBe(false);
  });
  it('normalise les symboles, fusionne le staking, ignore le total, prix = valeur / quantité', () => {
    const b = parseKrakenBalances(FILE);
    expect(b.map((x) => [x.symbol, x.quantity, x.fiat])).toEqual([['BTC', 0.5, false], ['ETH', 1.5, false], ['PEPE', 1000000, false], ['EUR', 150.5, true], ['FOO', 3, false]]);
    expect(b.find((x) => x.symbol === 'PEPE')!.priceUsd).toBeCloseTo(0.000005, 12);
  });
});

describe('Kraken : import par ajustement', () => {
  const first = applyKraken(makeVault(), parseKrakenBalances(FILE), opts());

  it('crée le compte et les actifs, atteint exactement les soldes', () => {
    expect(first.createdAccounts).toEqual(['Kraken']);
    expect(first.createdInstruments.sort()).toEqual(['Bitcoin', 'Ethereum', 'Pepe']);
    expect(qtyOf(first.vault, 'bitcoin')).toBeCloseTo(0.5, 12);
    expect(qtyOf(first.vault, 'ethereum')).toBeCloseTo(1.5, 12);
    const e = buildEngine(first.vault, emptyPriceFile(), '2026-10-28');
    const acc = first.vault.accounts[0];
    expect(acc).toMatchObject({ type: 'CRYPTO', institution: 'Kraken' });
    expect(e.current.cashByAccount[acc.id]).toBeCloseTo(150.5, 9);
    const btc = e.current.positions.find((p) => p.name === 'Bitcoin')!;
    expect(btc.pru).toBeCloseTo(70000, 6);
  });

  it('signale les actifs non reconnus', () => {
    expect(first.lines.find((l) => l.symbol === 'FOO')).toMatchObject({ status: 'skipped' });
  });

  it('réimport identique : aucun changement', () => {
    const again = applyKraken(first.vault, parseKrakenBalances(FILE), opts({ accountId: defaultKrakenAccount(first.vault) }));
    expect(again.added).toBe(0);
    expect(again.lines.filter((l) => l.status === 'ok')).toEqual([]);
  });

  it('instantané plus récent : vente partielle et ajout, sur le compte existant', () => {
    const later = csv('"XBT","currency","crypto","spot",0.3,"80,000.00","24,000.00"', '"ETH","currency","crypto","spot",2,"2,000.00","4,000.00"', '"PEPE","currency","crypto","spot","1,000,000.00",0,"5.00"');
    const r = applyKraken(first.vault, parseKrakenBalances(later), opts({ accountId: defaultKrakenAccount(first.vault), date: '2026-11-15' }));
    expect(r.createdAccounts).toEqual([]);
    expect(r.lines.find((l) => l.symbol === 'BTC')).toMatchObject({ status: 'ok', current: 0.5, target: 0.3 });
    expect(r.lines.find((l) => l.symbol === 'BTC')!.delta).toBeCloseTo(-0.2, 12);
    expect(qtyOf(r.vault, 'bitcoin', '2026-11-15')).toBeCloseTo(0.3, 12);
    expect(qtyOf(r.vault, 'ethereum', '2026-11-15')).toBeCloseTo(2, 12);
  });

  it('réutilise un actif existant (même identifiant CoinGecko)', () => {
    const v = makeVault({ instruments: [{ id: 'mybtc', name: 'BTC', kind: 'CRYPTO', assetClass: 'CRYPTO', currency: 'EUR', coingeckoId: 'bitcoin' }] });
    const r = applyKraken(v, parseKrakenBalances(FILE), opts());
    expect(r.vault.transactions.some((t) => t.instrumentId === 'mybtc')).toBe(true);
    expect(r.createdInstruments).not.toContain('Bitcoin');
  });

  it('sans cours en euros : ignoré plutôt que mal valorisé', () => {
    const r = applyKraken(makeVault(), parseKrakenBalances(FILE), opts({ eurPrices: {} }));
    expect(r.lines.find((l) => l.symbol === 'BTC')).toMatchObject({ status: 'skipped' });
  });
});
