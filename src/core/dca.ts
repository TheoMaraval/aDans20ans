import { addDays, addMonths, isoWeekday, type ISODate } from './dates';
import type { PriceBook } from './prices';
import type { DcaPlan, Id, PendingDca, Transaction, Vault } from './types';

/** Échéances du plan dans [from, to] (from par défaut = startDate). */
export function scheduleDates(plan: DcaPlan, from: ISODate | undefined, to: ISODate): ISODate[] {
  const lower = from && from > plan.startDate ? from : plan.startDate;
  let upper = to;
  if (plan.endDate && plan.endDate < upper) upper = plan.endDate;
  if (plan.pausedFrom) { const p = addDays(plan.pausedFrom, -1); if (p < upper) upper = p; }
  const out: ISODate[] = [];
  if (plan.frequency === 'MONTHLY' || plan.frequency === 'QUARTERLY') {
    const step = plan.frequency === 'MONTHLY' ? 1 : 3;
    const dom = String(plan.dayOfMonth ?? 1).padStart(2, '0');
    let d = `${plan.startDate.slice(0, 7)}-${dom}`;
    if (d < plan.startDate) d = addMonths(d, 1);
    for (; d <= upper; d = addMonths(d, step)) if (d >= lower) out.push(d);
  } else {
    const step = plan.frequency === 'WEEKLY' ? 7 : 14;
    let d = plan.startDate;
    while (isoWeekday(d) !== (plan.dayOfWeek ?? 1)) d = addDays(d, 1);
    for (; d <= upper; d = addDays(d, step)) if (d >= lower) out.push(d);
  }
  return out;
}

export interface ExpandResult { transactions: Transaction[]; pending: PendingDca[] }

/** Un achat réel du même actif sur le même compte dans cette fenêtre autour d'une échéance en tient lieu. */
const MATCH_BEFORE = 3, MATCH_AFTER = 10;

/**
 * Transactions réelles + achats DCA virtuels + versements implicites.
 * Les achats réels (saisis ou importés d'un courtier) proches d'une échéance sont rattachés au plan au lieu d'être doublés.
 */
export function expandTransactions(vault: Vault, book: PriceBook, today: ISODate): ExpandResult {
  const out: Transaction[] = [...vault.transactions];
  const pending: PendingDca[] = [];
  const instruments = new Map(vault.instruments.map((i) => [i.id, i]));
  const corrections = new Map<string, Transaction>();
  for (const t of vault.transactions) if (t.dcaPlanId && t.dcaDate) corrections.set(`${t.dcaPlanId}:${t.dcaDate}`, t);
  const freeBuys = vault.transactions.filter((t) => t.type === 'BUY' && !t.dcaPlanId);
  const matched = new Map<string, { dcaPlanId: string; dcaDate: ISODate }>();

  for (const plan of vault.dcaPlans) {
    const i = instruments.get(plan.instrumentId);
    if (!i) continue;
    for (const d of scheduleDates(plan, undefined, today)) {
      const corr = corrections.get(`${plan.id}:${d}`);
      if (corr) {
        const fx = corr.fxRate ?? book.fxAt(i.currency, corr.date);
        out.push(deposit(plan.id, d, plan.accountId, corr.date, (corr.quantity ?? 0) * (corr.unitPrice ?? 0) * fx + (corr.fees ?? 0)));
        continue;
      }
      const lo = addDays(d, -MATCH_BEFORE), hi = addDays(d, MATCH_AFTER);
      const real = freeBuys.find((t) => !matched.has(t.id) && t.accountId === plan.accountId && t.instrumentId === plan.instrumentId && t.date >= lo && t.date <= hi);
      if (real) { matched.set(real.id, { dcaPlanId: plan.id, dcaDate: d }); continue; }
      const pp = book.closeOnOrAfter(i, d);
      if (!pp) { pending.push({ planId: plan.id, date: d }); continue; }
      const date = pp.asOf.slice(0, 10);
      const fx = book.fxAt(i.currency, date);
      const fees = plan.amount * (plan.feesPct ?? 0);
      const raw = (plan.amount - fees) / (pp.price * fx);
      const quantity = plan.fractional ? raw : Math.floor(raw);
      out.push(deposit(plan.id, d, plan.accountId, date, plan.amount));
      if (quantity > 0) {
        out.push({
          id: `dca:${plan.id}:${d}`, accountId: plan.accountId, date, type: 'BUY', instrumentId: i.id,
          quantity, unitPrice: pp.price, fees, fxRate: fx, dcaPlanId: plan.id, dcaDate: d, virtual: true,
        });
      }
    }
  }
  return { transactions: matched.size ? out.map((t) => (matched.has(t.id) ? { ...t, ...matched.get(t.id) } : t)) : out, pending };
}

function deposit(planId: Id, d: ISODate, accountId: Id, date: ISODate, amount: number): Transaction {
  return { id: `dcadep:${planId}:${d}`, accountId, date, type: 'DEPOSIT', amount, dcaPlanId: planId, dcaDate: d, virtual: true };
}

const PER_MONTH: Record<DcaPlan['frequency'], number> = { WEEKLY: 52 / 12, BIWEEKLY: 26 / 12, MONTHLY: 1, QUARTERLY: 1 / 3 };
export const monthlyEquivalent = (plan: DcaPlan): number => plan.amount * PER_MONTH[plan.frequency];

export interface ProjectionPoint { year: number; invested: number; value: number }

/** Projection : versements mensuels capitalisés, un point par année (année 0 = aujourd'hui). */
export function projectDca(startValue: number, monthly: number, annualReturn: number, years: number): ProjectionPoint[] {
  const r = Math.pow(1 + annualReturn, 1 / 12) - 1;
  let value = startValue, invested = startValue;
  const out: ProjectionPoint[] = [{ year: 0, invested, value }];
  for (let m = 1; m <= years * 12; m++) {
    value = value * (1 + r) + monthly;
    invested += monthly;
    if (m % 12 === 0) out.push({ year: m / 12, invested: Math.round(invested * 100) / 100, value: Math.round(value * 100) / 100 });
  }
  return out;
}
