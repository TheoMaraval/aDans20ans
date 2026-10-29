import { z } from 'zod';

const id = z.string().min(1);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date attendue AAAA-MM-JJ');
const num = z.number().finite();
const pct = z.number().min(0).max(1);

export const accountTypeSchema = z.enum(['PEA', 'PEA_PME', 'CTO', 'ASSURANCE_VIE', 'PER', 'LIVRET_A', 'LDDS', 'LEP',
  'CEL', 'PEL', 'LIVRET_BANCAIRE', 'COMPTE_COURANT', 'CRYPTO', 'AUTRE']);
export const assetClassSchema = z.enum(['ACTIONS', 'OBLIGATIONS', 'CRYPTO', 'IMMOBILIER', 'CASH', 'BIENS', 'AUTRE']);
export const instrumentKindSchema = z.enum(['STOCK', 'ETF', 'FUND', 'BOND', 'CRYPTO', 'OTHER']);
export const txTypeSchema = z.enum(['BUY', 'SELL', 'DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST']);

export const accountSchema = z.object({
  id, name: z.string().min(1), type: accountTypeSchema,
  institution: z.string().optional(),
  currency: z.string().length(3).default('EUR'),
  openedAt: date.optional(),
  balanceHistory: z.array(z.object({ date, balance: num })).optional(),
  interestRate: num.optional(),
  ceiling: num.optional(),
  archived: z.boolean().optional(),
});

export const instrumentSchema = z.object({
  id, name: z.string().min(1), kind: instrumentKindSchema, assetClass: assetClassSchema,
  currency: z.string().length(3).default('EUR'),
  yahooSymbol: z.string().min(1).optional(),
  coingeckoId: z.string().min(1).optional(),
  isin: z.string().optional(),
  manualPrice: z.array(z.object({ date, price: num })).optional(),
});

export const transactionSchema = z.object({
  id, accountId: id, date, type: txTypeSchema,
  instrumentId: id.optional(),
  quantity: z.number().positive().optional(),
  unitPrice: z.number().nonnegative().optional(),
  amount: num.optional(),
  fees: z.number().nonnegative().optional(),
  fxRate: z.number().positive().optional(),
  note: z.string().optional(),
  dcaPlanId: id.optional(),
  dcaDate: date.optional(),
  virtual: z.boolean().optional(),
});

export const dcaPlanSchema = z.object({
  id, name: z.string().min(1), accountId: id, instrumentId: id,
  amount: z.number().positive(),
  frequency: z.enum(['WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY']),
  dayOfMonth: z.number().int().min(1).max(28).optional(),
  dayOfWeek: z.number().int().min(1).max(7).optional(),
  startDate: date, endDate: date.optional(),
  feesPct: pct.optional(),
  fractional: z.boolean().default(true),
  pausedFrom: date.optional(),
  expectedAnnualReturn: num.optional(),
});

export const realEstateSchema = z.object({
  id, name: z.string().min(1),
  kind: z.enum(['RESIDENCE_PRINCIPALE', 'LOCATIF', 'RESIDENCE_SECONDAIRE', 'SCPI_DIRECTE', 'AUTRE']),
  address: z.string().optional(), surfaceM2: num.optional(),
  purchaseDate: date, purchasePrice: z.number().nonnegative(),
  notaryFees: num.optional(), worksCost: num.optional(),
  ownershipPct: pct.default(1),
  valuations: z.array(z.object({ date, value: num, source: z.string().optional() })).default([]),
  monthlyRent: num.optional(), monthlyCharges: num.optional(), annualPropertyTax: num.optional(),
  loanIds: z.array(id).default([]),
});

export const loanSchema = z.object({
  id, name: z.string().min(1),
  kind: z.enum(['IMMOBILIER', 'CONSO', 'AUTO', 'ETUDIANT', 'AUTRE']),
  principal: z.number().positive(), annualRate: z.number().min(0),
  durationMonths: z.number().int().positive(),
  startDate: date,
  insuranceMonthly: num.optional(),
  ownershipPct: pct.default(1),
  manualOutstanding: z.array(z.object({ date, amount: z.number().nonnegative() })).optional(),
});

export const depreciationSchema = z.discriminatedUnion('model', [
  z.object({ model: z.literal('DEGRESSIVE'), annualRate: pct }),
  z.object({ model: z.literal('LINEAR'), years: z.number().positive(), residualPct: pct }),
  z.object({ model: z.literal('NONE') }),
]);

export const physicalAssetSchema = z.object({
  id, name: z.string().min(1),
  kind: z.enum(['VEHICULE', 'MONTRE', 'ART', 'OR_PHYSIQUE', 'AUTRE']),
  purchaseDate: date, purchasePrice: z.number().nonnegative(),
  depreciation: depreciationSchema,
  valuations: z.array(z.object({ date, value: num })).default([]),
  loanIds: z.array(id).default([]),
});

export const priceAlertSchema = z.object({
  id, instrumentId: id,
  condition: z.enum(['PRICE_BELOW', 'PRICE_ABOVE', 'GAIN_PCT_ABOVE', 'LOSS_PCT_BELOW']),
  threshold: num, note: z.string().optional(), active: z.boolean().default(true),
});

export const settingsSchema = z.object({
  baseCurrency: z.literal('EUR').default('EUR'),
  targetAllocation: z.record(assetClassSchema, pct).default({}),
  alertThresholds: z.object({
    weeklyMovePct: num.default(0.05),
    monthlyMovePct: num.default(0.1),
    allocationDriftPts: num.default(0.05),
    concentrationPct: num.default(0.2),
    emergencyFundMin: num.optional(),
    ceilingWarnPct: num.default(0.9),
  }).default({}),
  emergencyFundAccountIds: z.array(id).default([]),
  hideAmountsByDefault: z.boolean().default(false),
  autoLockMinutes: z.number().int().min(1).default(10),
  github: z.object({
    owner: z.string().default(''), repo: z.string().default(''), branch: z.string().default('main'),
    /** Token fine-grained (Contents : écriture sur ce dépôt), chiffré avec le reste du vault : suit l'utilisateur sur tous ses appareils. */
    token: z.string().optional(),
  }).default({}),
});

export const vaultSchema = z.object({
  version: z.literal(1),
  settings: settingsSchema.default({}),
  accounts: z.array(accountSchema).default([]),
  instruments: z.array(instrumentSchema).default([]),
  transactions: z.array(transactionSchema).default([]),
  dcaPlans: z.array(dcaPlanSchema).default([]),
  realEstate: z.array(realEstateSchema).default([]),
  loans: z.array(loanSchema).default([]),
  physicalAssets: z.array(physicalAssetSchema).default([]),
  priceAlerts: z.array(priceAlertSchema).default([]),
}).superRefine((v, ctx) => {
  const accounts = new Set(v.accounts.map((a) => a.id));
  const instruments = new Set(v.instruments.map((i) => i.id));
  const loans = new Set(v.loans.map((l) => l.id));
  const plans = new Set(v.dcaPlans.map((p) => p.id));
  const err = (path: (string | number)[], message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path, message });
  v.transactions.forEach((t, i) => {
    if (!accounts.has(t.accountId)) err(['transactions', i, 'accountId'], `compte inconnu ${t.accountId}`);
    if (['BUY', 'SELL', 'DIVIDEND'].includes(t.type) && !t.instrumentId) err(['transactions', i], `${t.type} sans instrument`);
    if (t.instrumentId && !instruments.has(t.instrumentId)) err(['transactions', i, 'instrumentId'], `instrument inconnu ${t.instrumentId}`);
    if ((t.type === 'BUY' || t.type === 'SELL') && (t.quantity === undefined || t.unitPrice === undefined)) err(['transactions', i], `${t.type} sans quantité ou prix`);
    if (['DIVIDEND', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST'].includes(t.type) && t.amount === undefined) err(['transactions', i], `${t.type} sans montant`);
    if (t.dcaPlanId && !plans.has(t.dcaPlanId)) err(['transactions', i, 'dcaPlanId'], `plan DCA inconnu ${t.dcaPlanId}`);
  });
  v.dcaPlans.forEach((p, i) => {
    if (!accounts.has(p.accountId)) err(['dcaPlans', i, 'accountId'], `compte inconnu ${p.accountId}`);
    if (!instruments.has(p.instrumentId)) err(['dcaPlans', i, 'instrumentId'], `instrument inconnu ${p.instrumentId}`);
  });
  v.realEstate.forEach((r, i) => r.loanIds.forEach((l) => { if (!loans.has(l)) err(['realEstate', i, 'loanIds'], `prêt inconnu ${l}`); }));
  v.physicalAssets.forEach((r, i) => r.loanIds.forEach((l) => { if (!loans.has(l)) err(['physicalAssets', i, 'loanIds'], `prêt inconnu ${l}`); }));
  v.priceAlerts.forEach((a, i) => { if (!instruments.has(a.instrumentId)) err(['priceAlerts', i], `instrument inconnu ${a.instrumentId}`); });
  v.settings.emergencyFundAccountIds.forEach((a) => { if (!accounts.has(a)) err(['settings', 'emergencyFundAccountIds'], `compte inconnu ${a}`); });
});

export class VaultValidationError extends Error {
  constructor(public issues: z.ZodIssue[]) {
    super(issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n'));
  }
}

export function parseVault(input: unknown) {
  const r = vaultSchema.safeParse(input);
  if (!r.success) throw new VaultValidationError(r.error.issues);
  return r.data;
}
