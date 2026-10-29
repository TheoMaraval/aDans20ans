import { describe, it, expect } from 'vitest';
import { balanceAt, accruedInterest, ceilingFor } from './savings';
import { acc } from './test-fixtures';

const livret = acc({ id: 'la', type: 'LIVRET_A', interestRate: 0.03, balanceHistory: [{ date: '2024-01-01', balance: 10000 }, { date: '2024-06-01', balance: 12000 }] });

describe('épargne', () => {
  it('solde à date', () => {
    expect(balanceAt(livret, '2023-12-31')).toBe(0);
    expect(balanceAt(livret, '2024-03-01')).toBe(10000);
    expect(balanceAt(livret, '2024-07-01')).toBe(12000);
  });
  it('intérêts courus estimés depuis le 1er janvier', () => {
    expect(accruedInterest({ ...livret, balanceHistory: [{ date: '2024-01-01', balance: 10000 }] }, '2024-07-01')).toBeCloseTo(10000 * 0.03 * 182 / 365, 6);
  });
  it('plafonds par défaut et surchargés', () => {
    expect(ceilingFor(livret)).toBe(22950);
    expect(ceilingFor({ ...livret, ceiling: 1 })).toBe(1);
    expect(ceilingFor(acc({ id: 'c', type: 'CTO' }))).toBeUndefined();
  });
});
