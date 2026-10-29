import { lastEntryOnOrBefore, yearsBetween, daysBetween, type ISODate } from './dates';
import type { PhysicalAsset, RealEstate } from './types';

export function physicalValueAt(a: PhysicalAsset, date: ISODate): number {
  if (date < a.purchaseDate) return 0;
  const manual = lastEntryOnOrBefore(a.valuations, date);
  const baseDate = manual?.date ?? a.purchaseDate;
  const baseValue = manual?.value ?? a.purchasePrice;
  const y = yearsBetween(baseDate, date);
  const d = a.depreciation;
  let v: number;
  if (d.model === 'DEGRESSIVE') v = baseValue * Math.pow(1 - d.annualRate, y);
  else if (d.model === 'LINEAR') {
    const residual = a.purchasePrice * d.residualPct;
    const remaining = d.years - yearsBetween(a.purchaseDate, baseDate);
    v = remaining <= 0 ? Math.min(baseValue, residual) : baseValue - (baseValue - residual) * Math.min(1, y / remaining);
    v = Math.max(v, Math.min(baseValue, residual));
  } else v = baseValue;
  return Math.round(v * 100) / 100;
}

export function realEstateValueAt(r: RealEstate, date: ISODate): number {
  if (date < r.purchaseDate) return 0;
  const pts = [{ date: r.purchaseDate, value: r.purchasePrice }, ...[...r.valuations].sort((a, b) => a.date.localeCompare(b.date))];
  let v = pts[pts.length - 1].value;
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1];
    if (date >= a.date && date < b.date) {
      v = a.value + ((b.value - a.value) * daysBetween(a.date, date)) / daysBetween(a.date, b.date);
      break;
    }
  }
  return Math.round(v * r.ownershipPct * 100) / 100;
}

/** Rendements annuels sur le coût total (prix + frais + travaux), à 100 % du bien. */
export function realEstateYields(r: RealEstate): { gross: number; net: number; cost: number } {
  const cost = r.purchasePrice + (r.notaryFees ?? 0) + (r.worksCost ?? 0);
  const rent = (r.monthlyRent ?? 0) * 12;
  const net = rent - (r.monthlyCharges ?? 0) * 12 - (r.annualPropertyTax ?? 0);
  return { gross: cost ? rent / cost : 0, net: cost ? net / cost : 0, cost };
}
