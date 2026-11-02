import { realEstateValueAt } from './assets';
import { balanceAt } from './savings';
import type { Engine } from './engine';
import { INVESTMENT_ACCOUNT_TYPES } from './types';

export interface GainsSummary {
  /** valeur des comptes d'investissement (espèces comprises, hors soldes saisis comme un fonds euros) */
  investValue: number;
  /** versements − retraits sur ces comptes */
  netDeposits: number;
  /** gain total des placements = valeur − versements nets */
  investGain: number;
  investPct: number | null;
  /** plus-value latente des positions détenues */
  unrealized: number;
  /** plus-values réalisées + dividendes (positions soldées comprises) */
  realized: number;
  /** valeur estimée − prix d'achat, à la quote-part */
  realEstateGain: number;
  hasRealEstate: boolean;
}

/** Plus-values à l'échelle du patrimoine (placements et immobilier). */
export function gainsSummary(e: Engine): GainsSummary {
  const { vault, current: cur, today } = e;
  const ids = new Set(vault.accounts.filter((a) => INVESTMENT_ACCOUNT_TYPES.has(a.type)).map((a) => a.id));
  const ccy = new Map(vault.accounts.map((a) => [a.id, a.currency]));
  let investValue = 0, netDeposits = 0, realized = 0;
  // Un solde saisi (fonds euros d'assurance-vie) n'a pas de versements connus : il est exclu du calcul du gain.
  for (const a of vault.accounts) if (ids.has(a.id)) {
    investValue += (cur.byAccount[a.id] ?? 0) - balanceAt(a, today);
    realized += cur.realizedByAccount[a.id] ?? 0;
  }
  for (const t of e.transactions) {
    if (!ids.has(t.accountId) || t.date > today) continue;
    const fx = e.book.fxAt(ccy.get(t.accountId) ?? 'EUR', t.date);
    if (t.type === 'DEPOSIT') netDeposits += (t.amount ?? 0) * fx;
    else if (t.type === 'WITHDRAWAL') netDeposits -= (t.amount ?? 0) * fx;
  }
  const unrealized = cur.positions.filter((p) => ids.has(p.accountId)).reduce((s, p) => s + p.unrealized, 0);
  const investGain = investValue - netDeposits;
  const realEstateGain = vault.realEstate.reduce((s, r) => s + realEstateValueAt(r, today) - r.purchasePrice * r.ownershipPct, 0);
  return {
    investValue, netDeposits, investGain, investPct: netDeposits > 0 ? investGain / netDeposits : null,
    unrealized, realized, realEstateGain, hasRealEstate: vault.realEstate.length > 0,
  };
}
