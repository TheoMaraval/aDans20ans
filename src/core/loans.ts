import { addMonths, lastEntryOnOrBefore, type ISODate } from './dates';
import type { Loan } from './types';

export function monthlyPayment(principal: number, annualRate: number, n: number): number {
  const i = annualRate / 12;
  return i === 0 ? principal / n : (principal * i) / (1 - Math.pow(1 + i, -n));
}

/** Solde après k mensualités M depuis un capital B. */
function balanceAfter(B: number, i: number, M: number, k: number): number {
  const b = i === 0 ? B - M * k : B * Math.pow(1 + i, k) - (M * (Math.pow(1 + i, k) - 1)) / i;
  return Math.max(0, b);
}

/** Nombre d'échéances (dates startDate + k mois) dans ]after, date]. */
function paymentsBetween(loan: Loan, after: ISODate | null, date: ISODate): number {
  let k = 0;
  for (let j = 0; j < loan.durationMonths; j++) {
    const d = addMonths(loan.startDate, j);
    if (d > date) break;
    if (!after || d > after) k++;
  }
  return k;
}

/** Capital restant dû à la date, quote-part appliquée. Le prêt existe à partir d'un mois avant la 1re échéance. */
export function outstandingAt(loan: Loan, date: ISODate): number {
  if (date < addMonths(loan.startDate, -1)) return 0;
  const i = loan.annualRate / 12;
  const M = monthlyPayment(loan.principal, loan.annualRate, loan.durationMonths);
  const manual = lastEntryOnOrBefore(loan.manualOutstanding, date);
  const b = manual
    ? balanceAfter(manual.amount, i, M, paymentsBetween(loan, manual.date, date))
    : balanceAfter(loan.principal, i, M, paymentsBetween(loan, null, date));
  return Math.round(b * (loan.ownershipPct ?? 1) * 100) / 100;
}

export interface LoanSummary { monthly: number; monthlyWithInsurance: number; endDate: ISODate; totalInterest: number; totalCost: number; outstanding: number; paidPct: number }

export function loanSummary(loan: Loan, date: ISODate): LoanSummary {
  const monthly = Math.round(monthlyPayment(loan.principal, loan.annualRate, loan.durationMonths) * 100) / 100;
  const ins = loan.insuranceMonthly ?? 0;
  const totalInterest = Math.round((monthly * loan.durationMonths - loan.principal) * 100) / 100;
  const own = loan.ownershipPct ?? 1;
  const outstanding = outstandingAt(loan, date);
  return {
    monthly, monthlyWithInsurance: monthly + ins,
    endDate: addMonths(loan.startDate, loan.durationMonths - 1),
    totalInterest, totalCost: totalInterest + ins * loan.durationMonths,
    outstanding, paidPct: 1 - outstanding / (loan.principal * own),
  };
}

export interface AmortizationRow { date: ISODate; interest: number; principal: number; balance: number }

export function amortizationSchedule(loan: Loan): AmortizationRow[] {
  const i = loan.annualRate / 12;
  const M = monthlyPayment(loan.principal, loan.annualRate, loan.durationMonths);
  let b = loan.principal;
  const rows: AmortizationRow[] = [];
  for (let k = 0; k < loan.durationMonths; k++) {
    const interest = b * i;
    const princ = Math.min(b, M - interest);
    b = Math.max(0, b - princ);
    rows.push({ date: addMonths(loan.startDate, k), interest, principal: princ, balance: Math.round(b * 100) / 100 });
  }
  return rows;
}
