import type { ISODate } from './dates';
import { runLedger } from './positions';
import type { PriceBook } from './prices';
import { physicalValueAt, realEstateValueAt } from './assets';
import { outstandingAt } from './loans';
import { balanceAt } from './savings';
import type { AssetClass, GroupKey, NetWorthBreakdown, PositionView, Transaction, Vault } from './types';

export interface ValuationContext { vault: Vault; book: PriceBook; transactions: Transaction[] }

const add = <K extends string>(r: Partial<Record<K, number>>, k: K, v: number) => { if (v) r[k] = (r[k] ?? 0) + v; };

export function valueAt(ctx: ValuationContext, date: ISODate): NetWorthBreakdown {
  const { vault, book } = ctx;
  const accounts = new Map(vault.accounts.map((a) => [a.id, a]));
  const instruments = new Map(vault.instruments.map((i) => [i.id, i]));
  const ledger = runLedger(ctx.transactions, accounts, instruments, book, date);

  const byClass: Partial<Record<AssetClass, number>> = {};
  const byGroup: Partial<Record<GroupKey, number>> = {};
  const byAccount: Record<string, number> = {};
  const debtsByLoan: Record<string, number> = {};
  const positions: PositionView[] = [];

  for (const p of ledger.positions) {
    if (p.quantity <= 0) continue;
    const i = instruments.get(p.instrumentId)!;
    const a = accounts.get(p.accountId);
    const fx = book.fxAt(i.currency, date);
    const pru = p.costBasis / p.quantity;
    const pp = book.priceAt(i, date);
    const price = pp?.price ?? pru / fx;
    const value = p.quantity * price * fx;
    positions.push({
      accountId: p.accountId, instrumentId: i.id, name: i.name, assetClass: i.assetClass,
      quantity: p.quantity, pru, price, currency: i.currency,
      priceAsOf: pp?.asOf ?? date, priceSource: pp?.source ?? 'cost',
      value, costBasis: p.costBasis, unrealized: value - p.costBasis,
      unrealizedPct: p.costBasis ? (value - p.costBasis) / p.costBasis : 0,
      realized: p.realized, dividends: p.dividends, weight: 0,
      changePct1d: date >= book.today ? book.changePct1d(i) : undefined,
    });
    add(byClass, i.assetClass, value);
    add(byAccount, p.accountId, value);
    if (a) add(byGroup, a.type, value);
  }

  const cashByAccount: Record<string, number> = {};
  for (const a of vault.accounts) {
    const cash = ledger.cash[a.id] ?? 0;
    const bal = balanceAt(a, date);
    if (cash) { cashByAccount[a.id] = cash; add(byClass, 'CASH', cash); }
    add(byClass, a.type === 'ASSURANCE_VIE' || a.type === 'PER' ? 'OBLIGATIONS' : 'CASH', bal);
    add(byAccount, a.id, cash + bal);
    add(byGroup, a.type, cash + bal);
  }

  for (const r of vault.realEstate) {
    const v = realEstateValueAt(r, date);
    add(byClass, 'IMMOBILIER', v); add(byGroup, 'IMMOBILIER', v); add(byAccount, r.id, v);
  }
  for (const p of vault.physicalAssets) {
    const v = physicalValueAt(p, date);
    add(byClass, 'BIENS', v); add(byGroup, 'BIENS', v); add(byAccount, p.id, v);
  }
  let debts = 0;
  for (const l of vault.loans) {
    const o = outstandingAt(l, date);
    if (o) { debtsByLoan[l.id] = o; debts += o; }
  }

  const gross = Object.values(byClass).reduce((s, v) => s + (v ?? 0), 0);
  for (const p of positions) p.weight = gross ? p.value / gross : 0;
  positions.sort((a, b) => b.value - a.value);
  const invested = Object.entries(ledger.netDeposits).reduce((s, [, v]) => s + v, 0);
  const realizedByAccount: Record<string, number> = {};
  for (const p of ledger.positions) add(realizedByAccount, p.accountId, p.realized + p.dividends);

  return { date, gross, debts, net: gross - debts, byClass, byGroup, byAccount, cashByAccount, debtsByLoan, positions, invested, realizedByAccount };
}
