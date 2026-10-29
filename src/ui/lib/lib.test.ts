import { describe, it, expect } from 'vitest';
import { eur, pct, signedEur, qty, dateFr } from './format';
import { upsert, removeById, upsertDated } from './collections';

const s = (x: string) => x.replace(/[  ]/g, ' ');
describe('format', () => {
  it('eur', () => {
    expect(s(eur(1234.5))).toBe('1 235 €');
    expect(s(eur(12.345))).toBe('12,35 €');
    expect(eur(1, true)).toBe('•••• €');
  });
  it('pct / signedEur / qty / date', () => {
    expect(s(pct(0.1234))).toBe('+12,3 %');
    expect(s(pct(-0.05))).toBe('-5,0 %');
    expect(pct(null)).toBe('—');
    expect(s(signedEur(-1500))).toBe('−1 500 €');
    expect(s(qty(1.23456789))).toBe('1,234568');
    expect(dateFr('2024-03-05')).toBe('05/03/2024');
  });
});
describe('collections', () => {
  it('upsert / remove / upsertDated', () => {
    expect(upsert([{ id: 'a', v: 1 }], { id: 'a', v: 2 })).toEqual([{ id: 'a', v: 2 }]);
    expect(upsert([{ id: 'a', v: 1 }], { id: 'b', v: 2 })).toHaveLength(2);
    expect(removeById([{ id: 'a' }, { id: 'b' }], 'a')).toEqual([{ id: 'b' }]);
    expect(upsertDated([{ date: '2024-02-01', x: 1 }, { date: '2024-01-01', x: 0 }], { date: '2024-02-01', x: 9 }))
      .toEqual([{ date: '2024-01-01', x: 0 }, { date: '2024-02-01', x: 9 }]);
  });
});
