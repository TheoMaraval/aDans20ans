import { parseCsvObjects } from '../csv';
import { newId } from '../defaults';
import { parseVault } from '../schema';
import type { Account, Id, Instrument, InstrumentKind, Transaction, Vault } from '../types';

/** Comptes d'un export Trade Republic : le PEA et le compte par défaut (espèces + compte-titres). */
export type TrAccountKey = 'PEA' | 'DEFAULT';
export const TR_ACCOUNT_KEYS: TrAccountKey[] = ['PEA', 'DEFAULT'];
export const TR_ACCOUNT_LABELS: Record<TrAccountKey, string> = { PEA: 'PEA', DEFAULT: 'Compte-titres / espèces' };
const NEW_ACCOUNT: Record<TrAccountKey, Pick<Account, 'name' | 'type'>> = {
  PEA: { name: 'PEA Trade Republic', type: 'PEA' },
  DEFAULT: { name: 'CTO Trade Republic', type: 'CTO' },
};

export interface TrInstrument { isin: string; name: string; kind: InstrumentKind }
export type TrTx = Omit<Transaction, 'accountId' | 'instrumentId'> & { accountKey: TrAccountKey; isin?: string };
export interface TrParsed { txs: TrTx[]; instruments: TrInstrument[]; accounts: TrAccountKey[]; ignored: number; from: string; to: string }

const REQUIRED = ['date', 'account_type', 'category', 'type', 'symbol', 'shares', 'price', 'amount', 'fee', 'tax', 'transaction_id'];
const num = (s?: string) => (s ? Number(s) : 0);

const CASH_LABELS: Record<string, string> = {
  TRANSFER_IN: 'Versement', TRANSFER_OUT: 'Versement vers le PEA', TRANSFER_INBOUND: 'Virement entrant',
  TRANSFER_INSTANT_INBOUND: 'Virement entrant', TRANSFER_OUTBOUND: 'Virement sortant', TRANSFER_INSTANT_OUTBOUND: 'Virement sortant',
  TRANSFER_DIRECT_DEBIT_INBOUND: 'Prélèvement entrant', BENEFITS_SAVEBACK: 'Saveback',
};

export function parseTradeRepublic(text: string): TrParsed {
  const rows = parseCsvObjects(text);
  if (!rows.length || !REQUIRED.every((k) => k in rows[0])) {
    throw new Error('Ce fichier n\'est pas un export de transactions Trade Republic (colonnes manquantes).');
  }
  const txs: TrTx[] = [];
  const instruments = new Map<string, TrInstrument>();
  const accounts = new Set<TrAccountKey>();
  const cards = new Map<string, TrTx>();
  let ignored = 0, from = '9999', to = '0000';

  for (const r of rows) {
    const accountKey: TrAccountKey = r.account_type === 'PEA' ? 'PEA' : 'DEFAULT';
    const date = r.date || r.datetime.slice(0, 10);
    const id = `tr:${r.transaction_id}`;
    const amount = num(r.amount);
    const charges = Math.abs(num(r.fee)) + Math.abs(num(r.tax));
    const qty = Math.abs(num(r.shares));
    accounts.add(accountKey);
    if (date < from) from = date;
    if (date > to) to = date;
    if (r.symbol && !instruments.has(r.symbol) && (r.category === 'TRADING' || r.type === 'BONUS_ISSUE' || r.type === 'DIVIDEND')) {
      instruments.set(r.symbol, { isin: r.symbol, name: r.name || r.symbol, kind: r.asset_class === 'FUND' ? 'ETF' : 'STOCK' });
    }
    const base = { id, date, accountKey };

    if (r.category === 'TRADING' && (r.type === 'BUY' || r.type === 'SELL') && qty > 0) {
      txs.push({ ...base, type: r.type, isin: r.symbol, quantity: qty, unitPrice: amount ? Math.abs(amount) / qty : num(r.price), fees: charges, fxRate: 1 });
    } else if (r.type === 'BONUS_ISSUE' && qty > 0) {
      txs.push({ ...base, type: 'BUY', isin: r.symbol, quantity: qty, unitPrice: 0, fxRate: 1, note: 'Attribution gratuite' });
    } else if (r.type === 'DIVIDEND') {
      txs.push({ ...base, type: 'DIVIDEND', isin: r.symbol, amount, fees: charges });
    } else if (r.type === 'INTEREST_PAYMENT') {
      txs.push({ ...base, type: 'INTEREST', amount, fees: charges, note: 'Intérêts Trade Republic' });
    } else if (r.category === 'CASH') {
      const total = amount - charges;
      if (!total) { ignored++; continue; }
      if (r.type.startsWith('CARD_')) {
        // Les paiements carte sont regroupés par mois : solde exact, sans le détail des dépenses.
        const month = date.slice(0, 7);
        const key = `${accountKey}:${month}`;
        const c = cards.get(key) ?? { id: `tr:card:${key}`, date, accountKey, type: 'WITHDRAWAL', amount: 0, note: `Dépenses carte ${month}` };
        c.amount = Math.round(((c.amount ?? 0) - total) * 100) / 100;
        if (date > c.date) c.date = date;
        cards.set(key, c);
      } else {
        txs.push({ ...base, type: total > 0 ? 'DEPOSIT' : 'WITHDRAWAL', amount: Math.abs(total), note: CASH_LABELS[r.type] ?? r.type });
      }
    } else ignored++;
  }
  for (const c of cards.values()) {
    if ((c.amount ?? 0) < 0) { c.type = 'DEPOSIT'; c.amount = -(c.amount ?? 0); }
    if (c.amount) txs.push(c);
  }
  return { txs, instruments: [...instruments.values()], accounts: TR_ACCOUNT_KEYS.filter((k) => accounts.has(k)), ignored, from, to };
}

/** Compte cible par clé : id d'un compte existant, ou 'new' pour en créer un. */
export type TrMapping = Record<TrAccountKey, Id | 'new'>;

export function defaultTrMapping(v: Vault): TrMapping {
  const find = (type: Account['type']) =>
    v.accounts.find((a) => a.type === type && /trade\s*republic/i.test(a.institution ?? a.name))?.id ?? 'new';
  return { PEA: find('PEA'), DEFAULT: find('CTO') };
}

export interface TrImportResult { vault: Vault; added: number; updated: number; createdAccounts: string[]; createdInstruments: string[] }

/** Fusionne l'export dans le vault : ajoute les opérations absentes (par identifiant Trade Republic), met à jour les cumuls carte. */
export function applyTradeRepublic(vault: Vault, p: TrParsed, mapping: TrMapping): TrImportResult {
  const v = structuredClone(vault);
  const createdAccounts: string[] = [];
  const createdInstruments: string[] = [];
  const accountIds = {} as Record<TrAccountKey, Id>;
  for (const k of p.accounts) {
    if (mapping[k] !== 'new' && v.accounts.some((a) => a.id === mapping[k])) { accountIds[k] = mapping[k]; continue; }
    const a: Account = { id: newId(), ...NEW_ACCOUNT[k], institution: 'Trade Republic', currency: 'EUR' };
    v.accounts.push(a);
    accountIds[k] = a.id;
    createdAccounts.push(a.name);
  }
  const byIsin = new Map(v.instruments.filter((i) => i.isin).map((i) => [i.isin!, i.id]));
  for (const ti of p.instruments) {
    if (byIsin.has(ti.isin)) continue;
    const i: Instrument = { id: newId(), name: ti.name, kind: ti.kind, assetClass: 'ACTIONS', currency: 'EUR', isin: ti.isin };
    v.instruments.push(i);
    byIsin.set(ti.isin, i.id);
    createdInstruments.push(ti.name);
  }
  const existing = new Map(v.transactions.map((t, idx) => [t.id, idx]));
  let added = 0, updated = 0;
  for (const { accountKey, isin, ...t } of p.txs) {
    const tx: Transaction = { ...t, accountId: accountIds[accountKey], ...(isin ? { instrumentId: byIsin.get(isin) } : {}) };
    const idx = existing.get(tx.id);
    if (idx === undefined) { v.transactions.push(tx); added++; continue; }
    const cur = v.transactions[idx];
    if (tx.id.startsWith('tr:card:') && (cur.amount !== tx.amount || cur.date !== tx.date || cur.type !== tx.type)) {
      v.transactions[idx] = tx;
      updated++;
    }
  }
  return { vault: parseVault(v), added, updated, createdAccounts, createdInstruments };
}
