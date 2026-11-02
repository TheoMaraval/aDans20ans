import { realEstateValueAt } from './assets';
import type { ISODate } from './dates';
import type { Engine } from './engine';
import { periodPnl, periodStart } from './pnl';
import { balanceAt } from './savings';
import { valueAt } from './valuation';
import { INVESTMENT_ACCOUNT_TYPES } from './types';

export interface GainsSummary {
  from: ISODate;
  /** versements − retraits sur les comptes d'investissement pendant la période */
  netDeposits: number;
  /** ce que les placements ont rapporté sur la période (hors argent ajouté) */
  investGain: number;
  investPct: number | null;
  /** part due à l'évolution des cours sur les positions détenues (= gain − réalisé) */
  unrealized: number;
  /** plus-values réalisées + dividendes encaissés pendant la période */
  realized: number;
  /** évolution de l'estimation immobilière (achats de la période déduits), à la quote-part */
  realEstateGain: number;
  hasRealEstate: boolean;
}

/**
 * Plus-values du patrimoine sur ]from, aujourd'hui] (depuis le début si `from` est omis).
 * Un solde saisi (fonds euros d'assurance-vie) n'a pas de versements connus : son évolution est exclue.
 */
export function gainsSummary(e: Engine, from?: ISODate): GainsSummary {
  const { vault, today, ctx } = e;
  const start = from ?? periodStart('MAX', today, vault);
  const invest = vault.accounts.filter((a) => INVESTMENT_ACCOUNT_TYPES.has(a.type));
  const p = periodPnl(ctx, invest.map((a) => a.id), start, today);
  const balanceDelta = invest.reduce((s, a) => s + balanceAt(a, today) - balanceAt(a, start), 0);
  const startBalances = invest.reduce((s, a) => s + balanceAt(a, start), 0);
  const investGain = p.pnl - balanceDelta;

  const realizedAt = (d: ISODate) => { const r = d === today ? e.current : valueAt(ctx, d); return invest.reduce((s, a) => s + (r.realizedByAccount[a.id] ?? 0), 0); };
  const realized = realizedAt(today) - realizedAt(start);

  const realEstateGain = vault.realEstate.reduce((s, r) => {
    const bought = r.purchaseDate > start && r.purchaseDate <= today ? r.purchasePrice * r.ownershipPct : 0;
    return s + realEstateValueAt(r, today) - realEstateValueAt(r, start) - bought;
  }, 0);

  const startValue = p.startValue - startBalances;
  const denom = Math.abs(startValue) < 0.01 ? p.flows : startValue + p.flows / 2;
  return {
    from: start, netDeposits: p.flows, investGain, investPct: denom > 0 ? investGain / denom : null,
    unrealized: investGain - realized, realized, realEstateGain, hasRealEstate: vault.realEstate.length > 0,
  };
}
