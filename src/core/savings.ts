import { daysBetween, lastEntryOnOrBefore, type ISODate } from './dates';
import type { Account, AccountType } from './types';

export const DEFAULT_CEILINGS: Partial<Record<AccountType, number>> = {
  LIVRET_A: 22950, LDDS: 12000, LEP: 10000, CEL: 15300, PEL: 61200, PEA: 150000, PEA_PME: 225000,
};

export const balanceAt = (a: Account, date: ISODate): number => lastEntryOnOrBefore(a.balanceHistory, date)?.balance ?? 0;

/** Estimation simple : solde × taux × jours écoulés dans l'année / 365. */
export function accruedInterest(a: Account, date: ISODate): number {
  if (!a.interestRate) return 0;
  const days = daysBetween(`${date.slice(0, 4)}-01-01`, date);
  return balanceAt(a, date) * a.interestRate * days / 365;
}

export const ceilingFor = (a: Account): number | undefined => a.ceiling ?? DEFAULT_CEILINGS[a.type];
