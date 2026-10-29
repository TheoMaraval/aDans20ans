import { describe, it, expect } from 'vitest';
import { monthlyPayment, outstandingAt, loanSummary, amortizationSchedule } from './loans';
import type { Loan } from './types';

const base: Loan = { id: 'l', name: 'Immo', kind: 'IMMOBILIER', principal: 200000, annualRate: 0.036, durationMonths: 240, startDate: '2024-02-05', ownershipPct: 1 };
const zero: Loan = { ...base, principal: 12000, annualRate: 0, durationMonths: 12 };

describe('loans', () => {
  it('mensualité', () => {
    expect(monthlyPayment(200000, 0.036, 240)).toBeCloseTo(1170.22, 1);
    expect(monthlyPayment(12000, 0, 12)).toBe(1000);
  });
  it('capital restant dû', () => {
    expect(outstandingAt(zero, '2023-12-01')).toBe(0);
    expect(outstandingAt(zero, '2024-01-10')).toBe(12000);
    expect(outstandingAt(zero, '2024-02-05')).toBe(11000);
    expect(outstandingAt(zero, '2025-06-01')).toBe(0);
    expect(outstandingAt(base, '2044-02-01')).toBeCloseTo(0, 0);
  });
  it('quote-part', () => { expect(outstandingAt({ ...zero, ownershipPct: 0.5 }, '2024-02-05')).toBe(5500); });
  it('valeur manuelle puis amortissement', () => {
    const l: Loan = { ...zero, manualOutstanding: [{ date: '2024-03-10', amount: 5000 }] };
    expect(outstandingAt(l, '2024-03-10')).toBe(5000);
    expect(outstandingAt(l, '2024-04-05')).toBe(4000);
  });
  it('résumé', () => {
    const s = loanSummary(zero, '2024-02-05');
    expect(s).toMatchObject({ monthly: 1000, endDate: '2025-01-05', totalInterest: 0, outstanding: 11000 });
    expect(s.paidPct).toBeCloseTo(1 / 12, 9);
  });
  it('tableau', () => {
    const t = amortizationSchedule(zero);
    expect(t).toHaveLength(12);
    expect(t[11]).toMatchObject({ date: '2025-01-05', balance: 0 });
  });
});
