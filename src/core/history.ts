import { addDays, addMonths, type ISODate } from './dates';
import { valueAt, type ValuationContext } from './valuation';
import type { NetWorthBreakdown, Snapshot, Vault } from './types';

export const toSnapshot = (b: NetWorthBreakdown): Snapshot => ({
  date: b.date, net: b.net, gross: b.gross, debts: b.debts, byClass: b.byClass, byAccount: b.byAccount, invested: b.invested,
});

export function earliestDate(v: Vault): ISODate | null {
  const ds: ISODate[] = [
    ...v.transactions.map((t) => t.date),
    ...v.dcaPlans.map((p) => p.startDate),
    ...v.realEstate.map((r) => r.purchaseDate),
    ...v.physicalAssets.map((p) => p.purchaseDate),
    ...v.loans.map((l) => addMonths(l.startDate, -1)),
    ...v.accounts.flatMap((a) => (a.balanceHistory ?? []).map((b) => b.date)),
  ];
  return ds.length ? ds.reduce((m, d) => (d < m ? d : m)) : null;
}

/** Quotidien sur les 365 derniers jours, hebdomadaire avant (aligné sur `to`). */
export function sampleDates(from: ISODate, to: ISODate): ISODate[] {
  const daily = addDays(to, -365);
  const out: ISODate[] = [];
  for (let d = to; d >= from; d = addDays(d, d > daily ? -1 : -7)) out.push(d);
  return out.reverse();
}

export function rebuildHistory(ctx: ValuationContext, from: ISODate, to: ISODate): Snapshot[] {
  return sampleDates(from, to).map((d) => toSnapshot(valueAt(ctx, d)));
}
