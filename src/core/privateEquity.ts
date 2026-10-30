import type { ISODate } from './dates';
import { newId } from './defaults';
import { parseVault } from './schema';
import type { Account, Id, Instrument, Vault } from './types';

export interface PrivateInvestmentInput {
  /** Compte existant, ou 'new' pour créer « Startups (non coté) ». */
  accountId: Id | 'new';
  name: string;
  date: ISODate;
  /** Montant investi (EUR). */
  amount: number;
  /** Valorisation actuelle (EUR), sinon le montant investi. */
  currentValue?: number;
  today: ISODate;
}

/**
 * Ajoute une participation non cotée (startup, crowdfunding, BSPCE…) : versement + achat d'une part
 * au montant investi, et valorisation manuelle (modifiable ensuite via « Prix manuel »).
 */
export function addPrivateInvestment(vault: Vault, i: PrivateInvestmentInput): Vault {
  const v = structuredClone(vault);
  let accountId = i.accountId;
  if (accountId === 'new' || !v.accounts.some((a) => a.id === accountId)) {
    const a: Account = { id: newId(), name: 'Startups (non coté)', type: 'NON_COTE', currency: 'EUR' };
    v.accounts.push(a);
    accountId = a.id;
  }
  const inst: Instrument = {
    id: newId(), name: i.name, kind: 'OTHER', assetClass: 'NON_COTE', currency: 'EUR',
    manualPrice: [{ date: i.today > i.date ? i.today : i.date, price: i.currentValue ?? i.amount }],
  };
  v.instruments.push(inst);
  v.transactions.push(
    { id: newId(), accountId, date: i.date, type: 'DEPOSIT', amount: i.amount, note: `Investissement ${i.name}` },
    { id: newId(), accountId, date: i.date, type: 'BUY', instrumentId: inst.id, quantity: 1, unitPrice: i.amount, fxRate: 1 },
  );
  return parseVault(v);
}
