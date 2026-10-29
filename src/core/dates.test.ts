import { describe, it, expect } from 'vitest';
import { addDays, addMonths, daysBetween, eachDay, isWeekend, isoWeekday, lastOnOrBefore, firstOnOrAfter, lastEntryOnOrBefore, yearsBetween } from './dates';

describe('dates', () => {
  it('addDays / daysBetween', () => {
    expect(addDays('2024-02-28', 2)).toBe('2024-03-01');
    expect(daysBetween('2024-01-01', '2025-01-01')).toBe(366);
  });
  it('addMonths borne au dernier jour du mois', () => {
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
    expect(addMonths('2024-03-15', -3)).toBe('2023-12-15');
  });
  it('eachDay inclusif', () => {
    expect(eachDay('2024-01-30', '2024-02-01')).toEqual(['2024-01-30', '2024-01-31', '2024-02-01']);
  });
  it('week-end et jour ISO', () => {
    expect(isWeekend('2024-05-05')).toBe(true);
    expect(isoWeekday('2024-01-08')).toBe(1);
    expect(isoWeekday('2024-01-07')).toBe(7);
  });
  it('recherche dans une série', () => {
    const s = { '2024-01-02': 1, '2024-01-05': 2, '2024-01-10': 3 };
    expect(lastOnOrBefore(s, '2024-01-07')).toEqual({ date: '2024-01-05', value: 2 });
    expect(lastOnOrBefore(s, '2024-01-01')).toBeNull();
    expect(firstOnOrAfter(s, '2024-01-06')).toEqual({ date: '2024-01-10', value: 3 });
    expect(firstOnOrAfter(s, '2024-01-11')).toBeNull();
  });
  it('lastEntryOnOrBefore sur tableau non trié', () => {
    const a = [{ date: '2024-03-01', v: 2 }, { date: '2024-01-01', v: 1 }];
    expect(lastEntryOnOrBefore(a, '2024-02-01')?.v).toBe(1);
    expect(lastEntryOnOrBefore(a, '2023-01-01')).toBeUndefined();
  });
  it('yearsBetween', () => { expect(yearsBetween('2020-01-01', '2021-01-01')).toBeCloseTo(1.002, 3); });
});
