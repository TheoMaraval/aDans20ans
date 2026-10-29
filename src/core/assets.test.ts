import { describe, it, expect } from 'vitest';
import { physicalValueAt, realEstateValueAt, realEstateYields } from './assets';
import type { PhysicalAsset, RealEstate } from './types';

const car: PhysicalAsset = { id: 'c', name: 'Clio', kind: 'VEHICULE', purchaseDate: '2022-01-01', purchasePrice: 20000, depreciation: { model: 'DEGRESSIVE', annualRate: 0.15 }, valuations: [], loanIds: [] };

describe('biens physiques', () => {
  it('avant achat : 0', () => { expect(physicalValueAt(car, '2021-12-31')).toBe(0); });
  it('dégressif', () => { expect(Math.abs(physicalValueAt(car, '2024-01-01') - 14450)).toBeLessThan(10); });
  it('linéaire avec résiduel', () => {
    const a: PhysicalAsset = { ...car, purchaseDate: '2020-01-01', purchasePrice: 10000, depreciation: { model: 'LINEAR', years: 5, residualPct: 0.2 } };
    expect(Math.abs(physicalValueAt(a, '2022-07-02') - 6000)).toBeLessThan(5);
    expect(physicalValueAt(a, '2030-01-01')).toBe(2000);
  });
  it('aucune décote', () => { expect(physicalValueAt({ ...car, depreciation: { model: 'NONE' } }, '2030-01-01')).toBe(20000); });
  it('une cote manuelle repart de sa valeur', () => {
    const a = { ...car, valuations: [{ date: '2023-01-01', value: 12000 }] };
    expect(physicalValueAt(a, '2023-01-01')).toBe(12000);
    expect(Math.abs(physicalValueAt(a, '2024-01-01') - 10200)).toBeLessThan(10);
  });
});

const flat: RealEstate = { id: 'r', name: 'Appart', kind: 'LOCATIF', purchaseDate: '2020-01-01', purchasePrice: 200000, notaryFees: 15000, worksCost: 5000, ownershipPct: 0.5, valuations: [{ date: '2022-01-01', value: 220000 }], monthlyRent: 1000, monthlyCharges: 100, annualPropertyTax: 1200, loanIds: [] };

describe('immobilier', () => {
  it('interpolation entre achat et estimation, quote-part', () => {
    expect(realEstateValueAt(flat, '2019-12-31')).toBe(0);
    expect(realEstateValueAt(flat, '2020-01-01')).toBe(100000);
    expect(Math.abs(realEstateValueAt(flat, '2021-01-01') - 105007)).toBeLessThan(2);
    expect(realEstateValueAt(flat, '2023-06-01')).toBe(110000);
  });
  it('rendements', () => {
    const y = realEstateYields(flat);
    expect(y.gross).toBeCloseTo(12000 / 220000, 6);
    expect(y.net).toBeCloseTo((10800 - 1200) / 220000, 6);
  });
});
