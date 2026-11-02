import { addDays, addMonths, type ISODate } from './dates';
import { earliestDate } from './history';
import { valueAt, type ValuationContext } from './valuation';
import type { Id, Vault } from './types';

export type PnlPeriod = '1J' | '1S' | '1M' | '6M' | '1A' | 'MAX';
export const PNL_PERIODS: { value: PnlPeriod; label: string }[] = [
  { value: '1J', label: '1J' }, { value: '1S', label: '1S' }, { value: '1M', label: '1M' },
  { value: '6M', label: '6M' }, { value: '1A', label: '1A' }, { value: 'MAX', label: 'Max' },
];

/** Date de référence (valeur de départ) d'une période se terminant à `to`. Max : la veille de la première opération. */
export function periodStart(p: PnlPeriod, to: ISODate, v: Vault): ISODate {
  switch (p) {
    case '1J': return addDays(to, -1);
    case '1S': return addDays(to, -7);
    case '1M': return addMonths(to, -1);
    case '6M': return addMonths(to, -6);
    case '1A': return addMonths(to, -12);
    case 'MAX': { const e = earliestDate(v); return e ? addDays(e < to ? e : to, -1) : addDays(to, -1); }
  }
}

export interface PeriodPnl {
  from: ISODate; to: ISODate;
  startValue: number; endValue: number;
  /** apports nets (versements − retraits) sur ]from, to] */
  flows: number;
  pnl: number;
  /** P&L / capital moyen engagé (Dietz simplifié) */
  pct: number | null;
  /** par position « compte|instrument » : variation de valeur − achats nets + dividendes nets */
  byPosition: Record<string, { pnl: number; pct: number | null }>;
}

/**
 * Profit & pertes de comptes sur ]from, to] : ce que les placements ont rapporté,
 * hors argent ajouté ou retiré (un achat ou un versement n'est pas un gain).
 */
export function periodPnl(ctx: ValuationContext, accountIds: Id[], from: ISODate, to: ISODate): PeriodPnl {
  const ids = new Set(accountIds);
  const a = valueAt(ctx, from), b = valueAt(ctx, to);
  const sum = (r: Record<Id, number>) => [...ids].reduce((s, id) => s + (r[id] ?? 0), 0);
  const startValue = sum(a.byAccount), endValue = sum(b.byAccount);
  const ccy = new Map(ctx.vault.accounts.map((x) => [x.id, x.currency]));
  const inst = new Map(ctx.vault.instruments.map((x) => [x.id, x]));

  let flows = 0;
  const netInvest: Record<string, number> = {};
  const income: Record<string, number> = {};
  for (const t of ctx.transactions) {
    if (!ids.has(t.accountId) || t.date <= from || t.date > to) continue;
    const accFx = ctx.book.fxAt(ccy.get(t.accountId) ?? 'EUR', t.date);
    if (t.type === 'DEPOSIT') flows += (t.amount ?? 0) * accFx;
    else if (t.type === 'WITHDRAWAL') flows -= (t.amount ?? 0) * accFx;
    if (!t.instrumentId) continue;
    const k = `${t.accountId}|${t.instrumentId}`;
    const fx = t.fxRate ?? ctx.book.fxAt(inst.get(t.instrumentId)?.currency ?? 'EUR', t.date);
    const gross = (t.quantity ?? 0) * (t.unitPrice ?? 0) * fx;
    const fees = (t.fees ?? 0) * accFx;
    if (t.type === 'BUY') netInvest[k] = (netInvest[k] ?? 0) + gross + fees;
    else if (t.type === 'SELL') netInvest[k] = (netInvest[k] ?? 0) - (gross - fees);
    else if (t.type === 'DIVIDEND') income[k] = (income[k] ?? 0) + (t.amount ?? 0) * accFx - fees;
  }

  const byPosition: PeriodPnl['byPosition'] = {};
  const posValue = (list: typeof a.positions) => {
    const m: Record<string, number> = {};
    for (const p of list) if (ids.has(p.accountId)) m[`${p.accountId}|${p.instrumentId}`] = p.value;
    return m;
  };
  const va = posValue(a.positions), vb = posValue(b.positions);
  for (const k of new Set([...Object.keys(va), ...Object.keys(vb), ...Object.keys(netInvest), ...Object.keys(income)])) {
    const pnl = (vb[k] ?? 0) - (va[k] ?? 0) - (netInvest[k] ?? 0) + (income[k] ?? 0);
    const base = (va[k] ?? 0) + Math.max(0, netInvest[k] ?? 0);
    byPosition[k] = { pnl, pct: base > 0 ? pnl / base : null };
  }

  const pnl = endValue - startValue - flows;
  // Depuis le début (valeur de départ nulle) : en % des versements, comme le « Gain total » et les courtiers.
  const denom = Math.abs(startValue) < 0.01 ? flows : startValue + flows / 2;
  return { from, to, startValue, endValue, flows, pnl, pct: denom > 0 ? pnl / denom : null, byPosition };
}
