import { emptyVault } from './defaults';
import { emptyPriceFile, type PriceFile } from './prices';
import type { Account, Instrument, Transaction, Vault } from './types';

export const makeVault = (p: Partial<Vault> = {}): Vault => ({ ...emptyVault(), ...p });
export const inst = (o: Partial<Instrument> & { id: string }): Instrument =>
  ({ name: o.id, kind: 'ETF', assetClass: 'ACTIONS', currency: 'EUR', ...o });
export const acc = (o: Partial<Account> & { id: string }): Account =>
  ({ name: o.id, type: 'PEA', currency: 'EUR', ...o });
let n = 0;
export const tx = (o: Omit<Transaction, 'id'> & { id?: string }): Transaction => ({ id: o.id ?? `t${++n}`, ...o });
export const prices = (p: Partial<PriceFile> = {}): PriceFile => ({ ...emptyPriceFile(), ...p });
