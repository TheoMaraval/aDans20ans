import { addMonths, type ISODate } from '../../src/core/dates';
import { emptyVault } from '../../src/core/defaults';
import type { Vault } from '../../src/core/types';

/** Données fictives réalistes, ancrées sur `today` (≈ 3 ans d'historique). */
export function demoVault(today: ISODate): Vault {
  const y3 = addMonths(today, -36), y2 = addMonths(today, -24), y1 = addMonths(today, -12);
  const v = emptyVault();
  v.settings.targetAllocation = { ACTIONS: 0.45, IMMOBILIER: 0.3, CASH: 0.15, CRYPTO: 0.05, OBLIGATIONS: 0.05 };
  v.settings.emergencyFundAccountIds = ['livretA', 'ldds'];
  v.settings.alertThresholds.emergencyFundMin = 15000;
  v.accounts = [
    { id: 'pea', name: 'PEA Boursorama', type: 'PEA', institution: 'Boursorama', currency: 'EUR', openedAt: y3 },
    { id: 'cto', name: 'CTO Trade Republic', type: 'CTO', institution: 'Trade Republic', currency: 'EUR', openedAt: y2 },
    { id: 'av', name: 'Assurance-vie Linxea', type: 'ASSURANCE_VIE', institution: 'Linxea', currency: 'EUR', openedAt: y3, balanceHistory: [{ date: y3, balance: 5000 }, { date: y1, balance: 8200 }] },
    { id: 'livretA', name: 'Livret A', type: 'LIVRET_A', institution: 'Banque', currency: 'EUR', interestRate: 0.024, balanceHistory: [{ date: y3, balance: 15000 }, { date: y1, balance: 21500 }] },
    { id: 'ldds', name: 'LDDS', type: 'LDDS', institution: 'Banque', currency: 'EUR', interestRate: 0.024, balanceHistory: [{ date: y2, balance: 6000 }] },
    { id: 'cc', name: 'Compte courant', type: 'COMPTE_COURANT', institution: 'Banque', currency: 'EUR', balanceHistory: [{ date: y3, balance: 2500 }, { date: addMonths(today, -1), balance: 3200 }] },
    { id: 'crypto', name: 'Ledger (manuel)', type: 'CRYPTO', currency: 'EUR', openedAt: y2 },
  ];
  v.instruments = [
    { id: 'cw8', name: 'Amundi MSCI World', kind: 'ETF', assetClass: 'ACTIONS', currency: 'EUR', yahooSymbol: 'CW8.PA', isin: 'LU1681043599' },
    { id: 'ese', name: 'BNP S&P 500', kind: 'ETF', assetClass: 'ACTIONS', currency: 'EUR', yahooSymbol: 'ESE.PA', isin: 'FR0011550185' },
    { id: 'aapl', name: 'Apple', kind: 'STOCK', assetClass: 'ACTIONS', currency: 'USD', yahooSymbol: 'AAPL' },
    { id: 'mc', name: 'LVMH', kind: 'STOCK', assetClass: 'ACTIONS', currency: 'EUR', yahooSymbol: 'MC.PA' },
    { id: 'btc', name: 'Bitcoin', kind: 'CRYPTO', assetClass: 'CRYPTO', currency: 'EUR', coingeckoId: 'bitcoin' },
    { id: 'eth', name: 'Ethereum', kind: 'CRYPTO', assetClass: 'CRYPTO', currency: 'EUR', coingeckoId: 'ethereum' },
  ];
  v.transactions = [
    { id: 'd1', accountId: 'pea', date: y3, type: 'DEPOSIT', amount: 10000 },
    { id: 'b1', accountId: 'pea', date: y3, type: 'BUY', instrumentId: 'cw8', quantity: 20, unitPrice: 380, fees: 1.9 },
    { id: 'b2', accountId: 'pea', date: y3, type: 'BUY', instrumentId: 'mc', quantity: 3, unitPrice: 640, fees: 1.9 },
    { id: 'd2', accountId: 'cto', date: y2, type: 'DEPOSIT', amount: 3000 },
    { id: 'b3', accountId: 'cto', date: y2, type: 'BUY', instrumentId: 'aapl', quantity: 10, unitPrice: 170, fees: 1 },
    { id: 'dv1', accountId: 'cto', date: y1, type: 'DIVIDEND', instrumentId: 'aapl', amount: 2.1 },
    { id: 'd3', accountId: 'crypto', date: y2, type: 'DEPOSIT', amount: 2000 },
    { id: 'b4', accountId: 'crypto', date: y2, type: 'BUY', instrumentId: 'eth', quantity: 1, unitPrice: 1700 },
  ];
  v.dcaPlans = [
    { id: 'dca-cw8', name: 'MSCI World mensuel', accountId: 'pea', instrumentId: 'cw8', amount: 300, frequency: 'MONTHLY', dayOfMonth: 5, startDate: y2, fractional: false, expectedAnnualReturn: 0.07 },
    { id: 'dca-ese', name: 'S&P 500 mensuel', accountId: 'pea', instrumentId: 'ese', amount: 150, frequency: 'MONTHLY', dayOfMonth: 5, startDate: y1, fractional: false, expectedAnnualReturn: 0.08 },
    { id: 'dca-btc', name: 'Bitcoin hebdo', accountId: 'crypto', instrumentId: 'btc', amount: 25, frequency: 'WEEKLY', dayOfWeek: 1, startDate: y1, fractional: true, feesPct: 0.01, expectedAnnualReturn: 0.1 },
  ];
  v.loans = [
    { id: 'pret-rp', name: 'Prêt résidence principale', kind: 'IMMOBILIER', principal: 180000, annualRate: 0.0135, durationMonths: 300, startDate: addMonths(y3, 1), insuranceMonthly: 25, ownershipPct: 1 },
    { id: 'pret-auto', name: 'Crédit auto', kind: 'AUTO', principal: 12000, annualRate: 0.049, durationMonths: 48, startDate: addMonths(y2, 1), ownershipPct: 1 },
  ];
  v.realEstate = [{ id: 'rp', name: 'Appartement Lyon 7e', kind: 'RESIDENCE_PRINCIPALE', surfaceM2: 58, purchaseDate: y3, purchasePrice: 225000, notaryFees: 17000, ownershipPct: 1, valuations: [{ date: y1, value: 232000, source: 'estimation agence' }], loanIds: ['pret-rp'] }];
  v.physicalAssets = [{ id: 'car', name: 'Peugeot 208', kind: 'VEHICULE', purchaseDate: y2, purchasePrice: 19500, depreciation: { model: 'DEGRESSIVE', annualRate: 0.15 }, valuations: [], loanIds: ['pret-auto'] }];
  v.priceAlerts = [{ id: 'al1', instrumentId: 'btc', condition: 'PRICE_BELOW', threshold: 50000, note: 'renforcer', active: true }];
  return v;
}
