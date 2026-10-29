import type { z } from 'zod';
import type {
  accountSchema, instrumentSchema, transactionSchema, dcaPlanSchema, realEstateSchema, loanSchema,
  physicalAssetSchema, priceAlertSchema, settingsSchema, vaultSchema,
} from './schema';
import type { ISODate } from './dates';

export type { ISODate };
export type Id = string;
export type Vault = z.infer<typeof vaultSchema>;
export type Account = z.infer<typeof accountSchema>;
export type AccountType = Account['type'];
export type Instrument = z.infer<typeof instrumentSchema>;
export type AssetClass = Instrument['assetClass'];
export type InstrumentKind = Instrument['kind'];
export type Transaction = z.infer<typeof transactionSchema>;
export type TxType = Transaction['type'];
export type DcaPlan = z.infer<typeof dcaPlanSchema>;
export type RealEstate = z.infer<typeof realEstateSchema>;
export type Loan = z.infer<typeof loanSchema>;
export type PhysicalAsset = z.infer<typeof physicalAssetSchema>;
export type PriceAlert = z.infer<typeof priceAlertSchema>;
export type Settings = z.infer<typeof settingsSchema>;

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  PEA: 'PEA', PEA_PME: 'PEA-PME', CTO: 'Compte-titres', ASSURANCE_VIE: 'Assurance-vie', PER: 'PER',
  LIVRET_A: 'Livret A', LDDS: 'LDDS', LEP: 'LEP', CEL: 'CEL', PEL: 'PEL', LIVRET_BANCAIRE: 'Livret bancaire',
  COMPTE_COURANT: 'Compte courant', CRYPTO: 'Crypto', AUTRE: 'Autre',
};
export const ACCOUNT_TYPES = Object.keys(ACCOUNT_TYPE_LABELS) as AccountType[];
/** Comptes dont la valeur est un solde saisi (pas de titres). */
export const BALANCE_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'LIVRET_A', 'LDDS', 'LEP', 'CEL', 'PEL', 'LIVRET_BANCAIRE', 'COMPTE_COURANT',
]);
export const INVESTMENT_ACCOUNT_TYPES: ReadonlySet<AccountType> = new Set<AccountType>([
  'PEA', 'PEA_PME', 'CTO', 'ASSURANCE_VIE', 'PER', 'CRYPTO', 'AUTRE',
]);

export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  ACTIONS: 'Actions', OBLIGATIONS: 'Obligations / fonds €', CRYPTO: 'Crypto', IMMOBILIER: 'Immobilier',
  CASH: 'Liquidités', BIENS: 'Biens', AUTRE: 'Autre',
};
export const ASSET_CLASSES = Object.keys(ASSET_CLASS_LABELS) as AssetClass[];

export type GroupKey = AccountType | 'IMMOBILIER' | 'BIENS';
export const GROUP_LABELS: Record<GroupKey, string> = { ...ACCOUNT_TYPE_LABELS, IMMOBILIER: 'Immobilier', BIENS: 'Véhicules & biens' };

export type PriceSource = 'live' | 'quote' | 'close' | 'manual' | 'transaction' | 'cost';

export interface PositionView {
  accountId: Id; instrumentId: Id; name: string; assetClass: AssetClass;
  quantity: number;
  /** PRU en EUR, frais inclus */
  pru: number;
  /** cours en devise de l'instrument */
  price: number; currency: string; priceAsOf: string; priceSource: PriceSource;
  value: number; costBasis: number; unrealized: number; unrealizedPct: number;
  realized: number; dividends: number; weight: number; changePct1d?: number;
}

export interface NetWorthBreakdown {
  date: ISODate;
  gross: number; debts: number; net: number;
  byClass: Partial<Record<AssetClass, number>>;
  byGroup: Partial<Record<GroupKey, number>>;
  /** valeur brute par compte / bien (id) */
  byAccount: Record<Id, number>;
  /** cash par compte d'investissement */
  cashByAccount: Record<Id, number>;
  /** capital restant dû par prêt */
  debtsByLoan: Record<Id, number>;
  positions: PositionView[];
  /** apports nets cumulés sur les comptes d'investissement */
  invested: number;
}

export interface Snapshot {
  date: ISODate; net: number; gross: number; debts: number;
  byClass: Partial<Record<AssetClass, number>>; byAccount: Record<Id, number>; invested: number;
}

export interface PendingDca { planId: Id; date: ISODate }
