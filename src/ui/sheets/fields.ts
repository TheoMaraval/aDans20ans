import { ACCOUNT_TYPE_LABELS, ASSET_CLASS_LABELS, BALANCE_ACCOUNT_TYPES, type Vault } from '../../core/types';
import type { FieldDef, Values } from '../components/Form';

const opts = (r: Record<string, string>) => Object.entries(r).map(([value, label]) => ({ value, label }));
const CURRENCIES = opts({ EUR: 'EUR', USD: 'USD', GBP: 'GBP', CHF: 'CHF', JPY: 'JPY', CAD: 'CAD' });
const isBalance = (v: Values) => BALANCE_ACCOUNT_TYPES.has(v.type as never) || v.type === 'ASSURANCE_VIE' || v.type === 'PER';

export const accountFields: FieldDef[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true, placeholder: 'PEA Boursorama' },
  { key: 'type', label: 'Type', type: 'select', required: true, options: opts(ACCOUNT_TYPE_LABELS) },
  { key: 'institution', label: 'Établissement', type: 'text' },
  { key: 'currency', label: 'Devise', type: 'select', required: true, options: CURRENCIES },
  { key: 'openedAt', label: 'Date d\'ouverture', type: 'date' },
  { key: 'balance', label: 'Solde actuel (€)', type: 'number', show: (v) => BALANCE_ACCOUNT_TYPES.has(v.type as never), hint: 'Enregistré à la date du jour ; mets-le à jour ensuite depuis la page Épargne.' },
  { key: 'interestRate', label: 'Taux annuel', type: 'percent', show: isBalance },
  { key: 'ceiling', label: 'Plafond (vide = réglementaire)', type: 'number' },
  { key: 'archived', label: 'Archivé (masqué)', type: 'checkbox' },
];

export const instrumentFields: FieldDef[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true, placeholder: 'Amundi MSCI World' },
  { key: 'kind', label: 'Nature', type: 'select', required: true, options: opts({ ETF: 'ETF', STOCK: 'Action', FUND: 'Fonds / UC / SCPI', BOND: 'Obligation', CRYPTO: 'Crypto', OTHER: 'Autre' }) },
  { key: 'assetClass', label: 'Classe d\'actif', type: 'select', required: true, options: opts(ASSET_CLASS_LABELS) },
  { key: 'currency', label: 'Devise de cotation', type: 'select', required: true, options: CURRENCIES },
  { key: 'yahooSymbol', label: 'Ticker Yahoo', type: 'text', placeholder: 'CW8.PA, ESE.PA, AAPL…', hint: 'Cherche l\'actif sur finance.yahoo.com et copie le symbole (suffixe .PA pour Euronext Paris).', show: (v) => v.kind !== 'CRYPTO' },
  { key: 'coingeckoId', label: 'Identifiant CoinGecko', type: 'text', placeholder: 'bitcoin', show: (v) => v.kind === 'CRYPTO' },
  { key: 'isin', label: 'ISIN', type: 'text' },
];

export const txFields = (v: Vault): FieldDef[] => {
  const needsInst = (x: Values) => ['BUY', 'SELL', 'DIVIDEND'].includes(String(x.type));
  const isTrade = (x: Values) => x.type === 'BUY' || x.type === 'SELL';
  return [
    { key: 'accountId', label: 'Compte', type: 'select', required: true, options: v.accounts.map((a) => ({ value: a.id, label: a.name })) },
    { key: 'type', label: 'Type', type: 'select', required: true, options: opts({ BUY: 'Achat', SELL: 'Vente', DIVIDEND: 'Dividende', DEPOSIT: 'Versement', WITHDRAWAL: 'Retrait', FEE: 'Frais', INTEREST: 'Intérêts' }) },
    { key: 'date', label: 'Date', type: 'date', required: true },
    { key: 'instrumentId', label: 'Actif', type: 'select', required: true, show: needsInst, options: v.instruments.map((i) => ({ value: i.id, label: i.name })) },
    { key: 'quantity', label: 'Quantité', type: 'number', required: true, show: isTrade },
    { key: 'unitPrice', label: 'Prix unitaire (devise de l\'actif)', type: 'number', required: true, show: isTrade },
    { key: 'amount', label: 'Montant (devise du compte)', type: 'number', required: true, show: (x) => !isTrade(x) },
    { key: 'fees', label: 'Frais (devise du compte)', type: 'number' },
    { key: 'fxRate', label: 'Taux de change (EUR par unité)', type: 'number', show: isTrade, hint: 'Vide = taux BCE du jour' },
    { key: 'note', label: 'Note', type: 'text' },
  ];
};

export const dcaFields = (v: Vault): FieldDef[] => [
  { key: 'name', label: 'Nom', type: 'text', required: true, placeholder: 'MSCI World mensuel' },
  { key: 'accountId', label: 'Compte', type: 'select', required: true, options: v.accounts.map((a) => ({ value: a.id, label: a.name })) },
  { key: 'instrumentId', label: 'Actif', type: 'select', required: true, options: v.instruments.map((i) => ({ value: i.id, label: i.name })) },
  { key: 'amount', label: 'Montant par échéance (€, frais inclus)', type: 'number', required: true },
  { key: 'frequency', label: 'Fréquence', type: 'select', required: true, options: opts({ MONTHLY: 'Mensuelle', WEEKLY: 'Hebdomadaire', BIWEEKLY: 'Toutes les 2 semaines', QUARTERLY: 'Trimestrielle' }) },
  { key: 'dayOfMonth', label: 'Jour du mois (1-28)', type: 'number', required: true, show: (x) => x.frequency === 'MONTHLY' || x.frequency === 'QUARTERLY' },
  { key: 'dayOfWeek', label: 'Jour de la semaine', type: 'select', required: true, show: (x) => x.frequency === 'WEEKLY' || x.frequency === 'BIWEEKLY', options: opts({ 1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche' }) },
  { key: 'startDate', label: 'Début', type: 'date', required: true },
  { key: 'endDate', label: 'Fin (optionnel)', type: 'date' },
  { key: 'feesPct', label: 'Frais', type: 'percent' },
  { key: 'fractional', label: 'Fractions de titres autorisées', type: 'checkbox' },
  { key: 'pausedFrom', label: 'En pause depuis', type: 'date', hint: 'Laisser vide si le plan est actif.' },
  { key: 'expectedAnnualReturn', label: 'Rendement annuel espéré (projection)', type: 'percent' },
];

export const realEstateFields = (v: Vault): FieldDef[] => [
  { key: 'name', label: 'Nom', type: 'text', required: true },
  { key: 'kind', label: 'Type', type: 'select', required: true, options: opts({ RESIDENCE_PRINCIPALE: 'Résidence principale', LOCATIF: 'Locatif', RESIDENCE_SECONDAIRE: 'Résidence secondaire', SCPI_DIRECTE: 'SCPI en direct', AUTRE: 'Autre' }) },
  { key: 'address', label: 'Adresse / ville', type: 'text' },
  { key: 'surfaceM2', label: 'Surface (m²)', type: 'number' },
  { key: 'purchaseDate', label: 'Date d\'achat', type: 'date', required: true },
  { key: 'purchasePrice', label: 'Prix d\'achat (€)', type: 'number', required: true },
  { key: 'notaryFees', label: 'Frais de notaire (€)', type: 'number' },
  { key: 'worksCost', label: 'Travaux (€)', type: 'number' },
  { key: 'ownershipPct', label: 'Quote-part détenue', type: 'percent', required: true },
  { key: 'monthlyRent', label: 'Loyer mensuel (€)', type: 'number' },
  { key: 'monthlyCharges', label: 'Charges mensuelles (€)', type: 'number' },
  { key: 'annualPropertyTax', label: 'Taxe foncière annuelle (€)', type: 'number' },
  { key: 'loanIds', label: 'Prêts liés', type: 'multi', options: v.loans.map((l) => ({ value: l.id, label: l.name })) },
];

export const loanFields: FieldDef[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true },
  { key: 'kind', label: 'Type', type: 'select', required: true, options: opts({ IMMOBILIER: 'Immobilier', CONSO: 'Consommation', AUTO: 'Auto', ETUDIANT: 'Étudiant', AUTRE: 'Autre' }) },
  { key: 'principal', label: 'Capital emprunté (€)', type: 'number', required: true },
  { key: 'annualRate', label: 'Taux nominal annuel', type: 'percent', required: true },
  { key: 'durationMonths', label: 'Durée (mois)', type: 'number', required: true },
  { key: 'startDate', label: 'Date de la 1re échéance', type: 'date', required: true },
  { key: 'insuranceMonthly', label: 'Assurance mensuelle (€)', type: 'number' },
  { key: 'ownershipPct', label: 'Quote-part', type: 'percent', required: true },
];

export const physicalFields = (v: Vault): FieldDef[] => [
  { key: 'name', label: 'Nom', type: 'text', required: true, placeholder: 'Peugeot 208' },
  { key: 'kind', label: 'Type', type: 'select', required: true, options: opts({ VEHICULE: 'Véhicule', MONTRE: 'Montre', ART: 'Art', OR_PHYSIQUE: 'Or physique', AUTRE: 'Autre' }) },
  { key: 'purchaseDate', label: 'Date d\'achat', type: 'date', required: true },
  { key: 'purchasePrice', label: 'Prix d\'achat (€)', type: 'number', required: true },
  { key: 'model', label: 'Décote', type: 'select', required: true, options: opts({ DEGRESSIVE: 'Dégressive (% par an)', LINEAR: 'Linéaire jusqu\'à une valeur résiduelle', NONE: 'Aucune' }) },
  { key: 'annualRate', label: 'Décote annuelle', type: 'percent', required: true, show: (x) => x.model === 'DEGRESSIVE' },
  { key: 'years', label: 'Durée (années)', type: 'number', required: true, show: (x) => x.model === 'LINEAR' },
  { key: 'residualPct', label: 'Valeur résiduelle', type: 'percent', required: true, show: (x) => x.model === 'LINEAR' },
  { key: 'loanIds', label: 'Prêts liés', type: 'multi', options: v.loans.map((l) => ({ value: l.id, label: l.name })) },
];

export const priceAlertFields = (v: Vault): FieldDef[] => [
  { key: 'instrumentId', label: 'Actif', type: 'select', required: true, options: v.instruments.map((i) => ({ value: i.id, label: i.name })) },
  { key: 'condition', label: 'Condition', type: 'select', required: true, options: opts({ PRICE_BELOW: 'Cours inférieur à', PRICE_ABOVE: 'Cours supérieur à', GAIN_PCT_ABOVE: 'Plus-value latente supérieure à', LOSS_PCT_BELOW: 'Moins-value latente au-delà de' }) },
  { key: 'threshold', label: 'Seuil (cours)', type: 'number', required: true, show: (x) => String(x.condition).startsWith('PRICE') },
  { key: 'thresholdPct', label: 'Seuil (%)', type: 'percent', required: true, show: (x) => !String(x.condition).startsWith('PRICE'), hint: 'Pour une moins-value, saisir un nombre négatif (ex. -20).' },
  { key: 'note', label: 'Note', type: 'text' },
  { key: 'active', label: 'Active', type: 'checkbox' },
];

export const datedValueFields = (label: string): FieldDef[] => [
  { key: 'date', label: 'Date', type: 'date', required: true },
  { key: 'value', label: label, type: 'number', required: true },
];
