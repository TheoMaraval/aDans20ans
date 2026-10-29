import { addDays, addMonths, type ISODate } from './dates';
import { computeAlerts, movers, type Alert, type Mover } from './alerts';
import { scheduleDates } from './dca';
import type { Engine } from './engine';
import { externalFlows, periodChange, type PeriodChange } from './performance';
import { valueAt } from './valuation';
import { ASSET_CLASSES, type AssetClass, type PendingDca } from './types';

export interface DcaLine { planName: string; date: ISODate; amount: number }
export interface WeeklyReport {
  date: ISODate; net: number; gross: number; debts: number;
  changes: (PeriodChange & { label: string })[];
  weekly: { date: ISODate; net: number }[];
  allocation: { cls: AssetClass; actual: number; target?: number }[];
  top: Mover[]; flop: Mover[];
  alerts: Alert[];
  dcaThisWeek: DcaLine[]; dcaNextWeek: DcaLine[]; pending: PendingDca[];
  pricesUpdatedAt: string; priceErrors: number;
}

export function buildWeeklyReport(e: Engine): WeeklyReport {
  const { today, current: cur, ctx, vault } = e;
  const period = (label: string, from: ISODate) => ({ label, ...periodChange(valueAt(ctx, from).net, cur.net, externalFlows(ctx, from, today)) });
  const weekly = Array.from({ length: 12 }, (_, k) => addDays(today, -7 * (11 - k))).map((d) => ({ date: d, net: d === today ? cur.net : valueAt(ctx, d).net }));
  const target = vault.settings.targetAllocation as Partial<Record<AssetClass, number>>;
  const allocation = ASSET_CLASSES
    .filter((c) => (cur.byClass[c] ?? 0) > 0 || target[c] !== undefined)
    .map((c) => ({ cls: c, actual: cur.gross ? (cur.byClass[c] ?? 0) / cur.gross : 0, target: target[c] }));
  const mv = movers(e, 7);
  const dca = (from: ISODate, to: ISODate): DcaLine[] => vault.dcaPlans.flatMap((p) =>
    scheduleDates(p, from, to).map((date) => ({ planName: p.name, date, amount: p.amount })))
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    date: today, net: cur.net, gross: cur.gross, debts: cur.debts,
    changes: [period('Semaine', addDays(today, -7)), period('Mois', addMonths(today, -1)), period('Depuis le 1er janvier', `${Number(today.slice(0, 4)) - 1}-12-31`)],
    weekly, allocation,
    top: mv.filter((m) => m.pct > 0).slice(0, 3),
    flop: mv.filter((m) => m.pct < 0).reverse().slice(0, 3),
    alerts: computeAlerts(e).filter((a) => a.level !== 'info'),
    dcaThisWeek: dca(addDays(today, -6), today),
    dcaNextWeek: dca(addDays(today, 1), addDays(today, 7)),
    pending: e.pendingDca,
    pricesUpdatedAt: e.prices.updatedAt, priceErrors: e.prices.errors.length,
  };
}
