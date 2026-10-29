import { addDays, daysBetween, lastEntryOnOrBefore } from './dates';
import { priceKey } from './prices';
import { ceilingFor, balanceAt } from './savings';
import type { Engine } from './engine';
import { ASSET_CLASS_LABELS, type AssetClass, type Id } from './types';

export type AlertLevel = 'info' | 'warn' | 'critical';
export type AlertFamily = 'MOVES' | 'ALLOCATION' | 'PRICE' | 'CONCENTRATION' | 'CEILING' | 'EMERGENCY' | 'DATA';
export const ALERT_FAMILY_LABELS: Record<AlertFamily, string> = {
  MOVES: 'Fortes variations', ALLOCATION: 'Allocation', PRICE: 'Seuils de prix', CONCENTRATION: 'Concentration',
  CEILING: 'Plafonds', EMERGENCY: 'Épargne de précaution', DATA: 'Données',
};

export interface Alert {
  id: string; family: AlertFamily; level: AlertLevel; title: string; detail: string;
  ref?: { kind: 'instrument' | 'account' | 'plan' | 'loan'; id: Id };
}

export interface Mover { instrumentId: Id; name: string; pct: number; value: number }

const pctFmt = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')} %`;
const eurFmt = (x: number) => `${Math.round(x).toLocaleString('fr-FR')} €`;

/** Variation de cours (pas de valeur) des instruments détenus sur `days` jours. */
export function movers(e: Engine, days: number): Mover[] {
  const agg = new Map<Id, Mover>();
  const from = addDays(e.today, -days);
  for (const p of e.current.positions) {
    const i = e.vault.instruments.find((x) => x.id === p.instrumentId)!;
    const then = e.book.priceAt(i, from);
    const m = agg.get(i.id) ?? { instrumentId: i.id, name: i.name, pct: NaN, value: 0 };
    m.value += p.value;
    if (then && then.price > 0) m.pct = p.price / then.price - 1;
    agg.set(i.id, m);
  }
  return [...agg.values()].filter((m) => isFinite(m.pct)).sort((a, b) => b.pct - a.pct);
}

export function computeAlerts(e: Engine): Alert[] {
  const { vault, current: cur, today } = e;
  const th = vault.settings.alertThresholds;
  const out: Alert[] = [];
  const instruments = new Map(vault.instruments.map((i) => [i.id, i]));

  // 1. Variations
  const m7 = new Map(movers(e, 7).map((m) => [m.instrumentId, m]));
  for (const m of movers(e, 30)) {
    const w = m7.get(m.instrumentId);
    if (w && Math.abs(w.pct) >= th.weeklyMovePct) {
      out.push({ id: `move:${m.instrumentId}`, family: 'MOVES', level: 'warn', title: `${m.name} ${pctFmt(w.pct)} sur 7 jours`, detail: `Position : ${eurFmt(m.value)}`, ref: { kind: 'instrument', id: m.instrumentId } });
    } else if (Math.abs(m.pct) >= th.monthlyMovePct) {
      out.push({ id: `move:${m.instrumentId}`, family: 'MOVES', level: 'info', title: `${m.name} ${pctFmt(m.pct)} sur 30 jours`, detail: `Position : ${eurFmt(m.value)}`, ref: { kind: 'instrument', id: m.instrumentId } });
    }
  }

  // 2. Allocation
  const target = vault.settings.targetAllocation as Partial<Record<AssetClass, number>>;
  if (cur.gross > 0 && Object.keys(target).length) {
    let worst: { c: AssetClass; d: number } | null = null;
    for (const [c, t] of Object.entries(target) as [AssetClass, number][]) {
      const actual = (cur.byClass[c] ?? 0) / cur.gross;
      const d = actual - t;
      if (Math.abs(d) >= th.allocationDriftPts) {
        out.push({ id: `drift:${c}`, family: 'ALLOCATION', level: 'warn', title: `${ASSET_CLASS_LABELS[c]} : ${(actual * 100).toFixed(0)} % (cible ${(t * 100).toFixed(0)} %)`, detail: `Écart de ${pctFmt(d).replace(' %', ' pts')}` });
      }
      if (!worst || d < worst.d) worst = { c, d };
    }
    if (worst && worst.d <= -th.allocationDriftPts) {
      out.push({ id: 'drift:suggestion', family: 'ALLOCATION', level: 'info', title: `Orienter les prochains versements vers : ${ASSET_CLASS_LABELS[worst.c]}`, detail: `Il manque environ ${eurFmt(-worst.d * cur.gross)} pour revenir à la cible.` });
    }
  }

  // 3. Seuils de prix
  for (const a of vault.priceAlerts) {
    if (!a.active) continue;
    const i = instruments.get(a.instrumentId);
    if (!i) continue;
    const ps = cur.positions.filter((p) => p.instrumentId === i.id);
    const price = e.book.priceAt(i, today)?.price;
    const cost = ps.reduce((s, p) => s + p.costBasis, 0);
    const gain = cost ? ps.reduce((s, p) => s + p.value, 0) / cost - 1 : undefined;
    const hit =
      (a.condition === 'PRICE_BELOW' && price !== undefined && price < a.threshold) ||
      (a.condition === 'PRICE_ABOVE' && price !== undefined && price > a.threshold) ||
      (a.condition === 'GAIN_PCT_ABOVE' && gain !== undefined && gain > a.threshold) ||
      (a.condition === 'LOSS_PCT_BELOW' && gain !== undefined && gain < a.threshold);
    if (hit) {
      const what = a.condition.startsWith('PRICE') ? `cours ${price?.toLocaleString('fr-FR')} ${i.currency}` : `PV latente ${pctFmt(gain!)}`;
      out.push({ id: `price:${a.id}`, family: 'PRICE', level: 'warn', title: `${i.name} : seuil atteint`, detail: `${what}${a.note ? ` — ${a.note}` : ''}`, ref: { kind: 'instrument', id: i.id } });
    }
  }

  // 4. Concentration (par instrument, tous comptes)
  const byInst = new Map<Id, { name: string; value: number }>();
  for (const p of cur.positions) {
    const x = byInst.get(p.instrumentId) ?? { name: p.name, value: 0 };
    x.value += p.value; byInst.set(p.instrumentId, x);
  }
  for (const [id, x] of byInst) {
    const w = cur.gross ? x.value / cur.gross : 0;
    if (w > th.concentrationPct) out.push({ id: `concentration:${id}`, family: 'CONCENTRATION', level: 'warn', title: `${x.name} pèse ${(w * 100).toFixed(1).replace('.', ',')} % du patrimoine`, detail: `Seuil : ${(th.concentrationPct * 100).toFixed(0)} %`, ref: { kind: 'instrument', id } });
  }

  // 5. Plafonds
  const deposits = (accId: Id) => e.transactions.filter((t) => t.accountId === accId && t.type === 'DEPOSIT').reduce((s, t) => s + (t.amount ?? 0), 0);
  const peaDeposits = vault.accounts.filter((a) => a.type === 'PEA').reduce((s, a) => s + deposits(a.id), 0);
  for (const a of vault.accounts) {
    const ceiling = ceilingFor(a);
    if (!ceiling || a.archived) continue;
    const used = a.type === 'PEA' ? deposits(a.id) : a.type === 'PEA_PME' ? deposits(a.id) + peaDeposits : balanceAt(a, today);
    const r = used / ceiling;
    if (r >= th.ceilingWarnPct) {
      out.push({ id: `ceiling:${a.id}`, family: 'CEILING', level: r >= 1 ? 'critical' : 'warn', title: `${a.name} à ${(r * 100).toFixed(0)} % du plafond`, detail: `${eurFmt(used)} / ${eurFmt(ceiling)}`, ref: { kind: 'account', id: a.id } });
    }
  }

  // 6. Épargne de précaution
  if (th.emergencyFundMin && vault.settings.emergencyFundAccountIds.length) {
    const s = vault.settings.emergencyFundAccountIds.reduce((t, id) => t + (cur.byAccount[id] ?? 0), 0);
    if (s < th.emergencyFundMin) out.push({ id: 'emergency', family: 'EMERGENCY', level: 'warn', title: `Épargne de précaution sous le minimum`, detail: `${eurFmt(s)} / ${eurFmt(th.emergencyFundMin)}` });
  }

  // 7. Données
  const stale = cur.positions.filter((p) => {
    const i = instruments.get(p.instrumentId)!;
    return priceKey(i) && (p.priceSource === 'transaction' || p.priceSource === 'cost' || daysBetween(p.priceAsOf.slice(0, 10), today) > 4);
  });
  if (stale.length) out.push({ id: 'data:stale', family: 'DATA', level: 'info', title: `${stale.length} cours non à jour`, detail: stale.map((p) => p.name).join(', ') });
  if (e.pendingDca.length) out.push({ id: 'data:pending-dca', family: 'DATA', level: 'warn', title: `${e.pendingDca.length} échéance(s) DCA sans cours`, detail: e.pendingDca.map((p) => `${vault.dcaPlans.find((x) => x.id === p.planId)?.name} (${p.date})`).join(', ') });
  if (e.prices.errors.length) out.push({ id: 'data:errors', family: 'DATA', level: 'warn', title: `${e.prices.errors.length} erreur(s) de récupération de cours`, detail: e.prices.errors.map((x) => `${x.symbol} : ${x.message}`).join(' · ') });
  for (const l of vault.loans) {
    const last = lastEntryOnOrBefore(l.manualOutstanding, today)?.date ?? l.startDate;
    if (daysBetween(last, today) > 365 && (cur.debtsByLoan[l.id] ?? 0) > 0) {
      out.push({ id: `data:loan:${l.id}`, family: 'DATA', level: 'info', title: `Vérifier le capital restant dû de « ${l.name} »`, detail: 'Calculé depuis plus d\'un an sans valeur saisie (remboursement anticipé ?).', ref: { kind: 'loan', id: l.id } });
    }
  }

  const rank = { critical: 0, warn: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
