import type { ISODate } from './dates';
import type { PriceBook } from './prices';
import type { Account, Id, Instrument, Transaction } from './types';

export interface PositionState {
  accountId: Id; instrumentId: Id;
  quantity: number;
  /** EUR, frais d'achat inclus */
  costBasis: number;
  realized: number; dividends: number;
  firstDate: ISODate;
}

export interface LedgerResult {
  positions: PositionState[];
  /** cash EUR par compte, issu des transactions */
  cash: Record<Id, number>;
  /** versements − retraits EUR par compte */
  netDeposits: Record<Id, number>;
  errors: string[];
}

const EPS = 1e-9;

export function runLedger(
  txs: Transaction[], accounts: Map<Id, Account>, instruments: Map<Id, Instrument>, book: PriceBook, until?: ISODate,
): LedgerResult {
  const sorted = txs.filter((t) => !until || t.date <= until).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const pos = new Map<string, PositionState>();
  const cash: Record<Id, number> = {};
  const netDeposits: Record<Id, number> = {};
  const errors: string[] = [];

  for (const t of sorted) {
    const accFx = book.fxAt(accounts.get(t.accountId)?.currency ?? 'EUR', t.date);
    const amount = (t.amount ?? 0) * accFx;
    const fees = (t.fees ?? 0) * accFx;
    cash[t.accountId] ??= 0;
    netDeposits[t.accountId] ??= 0;

    if (t.type === 'BUY' || t.type === 'SELL' || t.type === 'DIVIDEND') {
      const i = instruments.get(t.instrumentId!);
      if (!i) { errors.push(`${t.id}: instrument inconnu`); continue; }
      const key = `${t.accountId}|${i.id}`;
      const p = pos.get(key) ?? { accountId: t.accountId, instrumentId: i.id, quantity: 0, costBasis: 0, realized: 0, dividends: 0, firstDate: t.date };
      pos.set(key, p);
      const fx = t.fxRate ?? book.fxAt(i.currency, t.date);
      const gross = (t.quantity ?? 0) * (t.unitPrice ?? 0) * fx;

      if (t.type === 'BUY') {
        p.quantity += t.quantity!;
        p.costBasis += gross + fees;
        cash[t.accountId] -= gross + fees;
      } else if (t.type === 'SELL') {
        let q = t.quantity!;
        if (q > p.quantity + EPS) {
          errors.push(`${t.id}: vente de ${q} > ${p.quantity} détenus (${i.name})`);
          q = p.quantity;
        }
        const pru = p.quantity > EPS ? p.costBasis / p.quantity : 0;
        const proceeds = q * (t.unitPrice ?? 0) * fx;
        p.realized += proceeds - fees - q * pru;
        p.costBasis -= q * pru;
        p.quantity -= q;
        if (p.quantity < EPS) { p.quantity = 0; p.costBasis = 0; }
        cash[t.accountId] += proceeds - fees;
      } else {
        p.dividends += amount;
        cash[t.accountId] += amount - fees;
      }
      continue;
    }
    switch (t.type) {
      case 'DEPOSIT': cash[t.accountId] += amount; netDeposits[t.accountId] += amount; break;
      case 'WITHDRAWAL': cash[t.accountId] -= amount; netDeposits[t.accountId] -= amount; break;
      case 'FEE': cash[t.accountId] -= amount + fees; break;
      case 'INTEREST': cash[t.accountId] += amount - fees; break;
    }
  }
  return { positions: [...pos.values()], cash, netDeposits, errors };
}
