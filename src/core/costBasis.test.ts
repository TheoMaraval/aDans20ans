import { describe, it, expect } from 'vitest';
import { adjustableBuys, setPositionCost } from './costBasis';
import { applyKraken, defaultKrakenAccount, parseKrakenBalances } from './importers/kraken';
import { buildEngine } from './engine';
import { emptyPriceFile } from './prices';
import { makeVault } from './test-fixtures';
import type { Vault } from './types';

const H = '"asset","aclass","subclass","wallet","quantity","price (USD)","value (USD)"';
const snap = (btc: number) => [H, `"XBT","currency","crypto","spot",${btc},"80,000.00","${btc * 80000}"`, ''].join('\n');
const imp = (v: Vault, btc: number, date: string) => applyKraken(v, parseKrakenBalances(snap(btc)), {
  accountId: defaultKrakenAccount(v), date, prices: emptyPriceFile(), eurPrices: { BTC: 70000 }, coingeckoIds: {},
}).vault;
const pos = (v: Vault, date: string) => {
  const e = buildEngine(v, emptyPriceFile(), date);
  const p = e.current.positions.find((x) => x.name === 'Bitcoin')!;
  return { p, e, acc: p.accountId, inst: p.instrumentId };
};

describe('corriger le PRU', () => {
  it('ajuste le prix de l\'achat Kraken et son versement : PRU exact, espèces inchangées', () => {
    const v = imp(makeVault(), 0.5, '2026-10-28');
    const { acc, inst } = pos(v, '2026-10-28');
    expect(adjustableBuys(v, acc, inst)).toHaveLength(1);
    const out = setPositionCost(v, acc, inst, 0.5 * 37326.09, '2026-10-30');
    const { p, e } = pos(out, '2026-10-30');
    expect(p.pru).toBeCloseTo(37326.09, 6);
    expect(e.current.cashByAccount[acc] ?? 0).toBeCloseTo(0, 6);
    const dep = out.transactions.find((t) => t.id.endsWith(':cash'))!;
    expect(dep.amount).toBeCloseTo(18663.045, 6);
    expect(v.transactions.find((t) => t.id.endsWith(':trade'))!.unitPrice).toBe(70000);
  });

  it('avec une vente ultérieure (prix moyen pondéré)', () => {
    const v = imp(imp(makeVault(), 0.5, '2026-10-28'), 0.3, '2026-11-10');
    const { acc, inst } = pos(v, '2026-11-10');
    const out = setPositionCost(v, acc, inst, 0.3 * 40000, '2026-11-10');
    expect(pos(out, '2026-11-10').p.pru).toBeCloseTo(40000, 6);
  });

  it('refuse une position sans achat d\'ajustement Kraken', () => {
    expect(() => setPositionCost(makeVault(), 'a', 'i', 100, '2026-10-30')).toThrow(/Kraken/);
  });
});
