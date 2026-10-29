import { addMonths, daysBetween, type ISODate } from './dates';
import { balanceAt } from './savings';
import type { ValuationContext } from './valuation';
import type { Id } from './types';

export interface Flow { date: ISODate; amount: number }

export function xirr(flows: Flow[]): number | null {
  if (flows.length < 2 || !flows.some((f) => f.amount < 0) || !flows.some((f) => f.amount > 0)) return null;
  const t0 = flows.reduce((m, f) => (f.date < m ? f.date : m), flows[0].date);
  const ts = flows.map((f) => daysBetween(t0, f.date) / 365);
  const npv = (r: number) => flows.reduce((s, f, k) => s + f.amount / Math.pow(1 + r, ts[k]), 0);
  const dnpv = (r: number) => flows.reduce((s, f, k) => s - (ts[k] * f.amount) / Math.pow(1 + r, ts[k] + 1), 0);
  let r = 0.1;
  for (let k = 0; k < 100; k++) {
    const v = npv(r), d = dnpv(r);
    if (!isFinite(v) || !isFinite(d) || d === 0) break;
    const next = r - v / d;
    if (next <= -0.9999 || !isFinite(next)) break;
    if (Math.abs(next - r) < 1e-7) return next;
    r = next;
  }
  let lo = -0.9999, hi = 10;
  let flo = npv(lo);
  if (flo * npv(hi) > 0) return null;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-9) return mid;
    if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/** Argent neuf entré dans le patrimoine sur ]from, to] (EUR). */
export function externalFlows(ctx: ValuationContext, from: ISODate, to: ISODate): number {
  const { vault, book } = ctx;
  const ccy = new Map(vault.accounts.map((a) => [a.id, a.currency]));
  let f = 0;
  for (const t of ctx.transactions) {
    if (t.date <= from || t.date > to) continue;
    const fx = book.fxAt(ccy.get(t.accountId) ?? 'EUR', t.date);
    if (t.type === 'DEPOSIT') f += (t.amount ?? 0) * fx;
    else if (t.type === 'WITHDRAWAL') f -= (t.amount ?? 0) * fx;
  }
  for (const a of vault.accounts) if (a.balanceHistory?.length) f += balanceAt(a, to) - balanceAt(a, from);
  for (const r of vault.realEstate) if (r.purchaseDate > from && r.purchaseDate <= to) f += r.purchasePrice * r.ownershipPct;
  for (const p of vault.physicalAssets) if (p.purchaseDate > from && p.purchaseDate <= to) f += p.purchasePrice;
  for (const l of vault.loans) {
    const d = addMonths(l.startDate, -1);
    if (d > from && d <= to) f -= l.principal * (l.ownershipPct ?? 1);
  }
  return f;
}

export interface PeriodChange { change: number; flows: number; changeExFlows: number; pct: number | null }

/** Variation : brute, et hors apports (Dietz simplifié pour le %). */
export function periodChange(netFrom: number, netTo: number, flows: number): PeriodChange {
  const change = netTo - netFrom;
  const changeExFlows = change - flows;
  const denom = netFrom + flows / 2;
  return { change, flows, changeExFlows, pct: denom > 0 ? changeExFlows / denom : null };
}

/** XIRR des comptes donnés : versements (−), retraits (+), valeur finale (+). */
export function accountXirr(ctx: ValuationContext, accountIds: Id[], currentValue: number, date: ISODate): number | null {
  const ids = new Set(accountIds);
  const ccy = new Map(ctx.vault.accounts.map((a) => [a.id, a.currency]));
  const flows: Flow[] = [];
  for (const t of ctx.transactions) {
    if (!ids.has(t.accountId) || t.date > date) continue;
    const fx = ctx.book.fxAt(ccy.get(t.accountId) ?? 'EUR', t.date);
    if (t.type === 'DEPOSIT') flows.push({ date: t.date, amount: -(t.amount ?? 0) * fx });
    else if (t.type === 'WITHDRAWAL') flows.push({ date: t.date, amount: (t.amount ?? 0) * fx });
  }
  flows.push({ date, amount: currentValue });
  return xirr(flows);
}
