import { parseCsvObjects } from '../csv';
import type { ISODate } from '../dates';
import { newId } from '../defaults';
import { buildEngine } from '../engine';
import type { PriceFile } from '../prices';
import { parseVault } from '../schema';
import type { Account, Id, Instrument, Transaction, Vault } from '../types';

/** Solde d'un actif dans un export « balances » Kraken (instantané, sans historique). */
export interface KrakenBalance { symbol: string; quantity: number; priceUsd: number; fiat: boolean }

/** Symbole → identifiant CoinGecko pour les actifs courants ; les autres sont recherchés par l'interface. */
export const COINGECKO_IDS: Record<string, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana', XRP: 'ripple', DOGE: 'dogecoin', FIL: 'filecoin', PEPE: 'pepe',
  TAO: 'bittensor', USDC: 'usd-coin', USDT: 'tether', ADA: 'cardano', DOT: 'polkadot', LINK: 'chainlink',
  AVAX: 'avalanche-2', ATOM: 'cosmos', LTC: 'litecoin', TRX: 'tron', BNB: 'binancecoin', SHIB: 'shiba-inu',
  ARB: 'arbitrum', OP: 'optimism', NEAR: 'near', SUI: 'sui', APT: 'aptos', KAS: 'kaspa', INJ: 'injective-protocol',
  RENDER: 'render-token', FET: 'fetch-ai', UNI: 'uniswap', AAVE: 'aave', POL: 'polygon-ecosystem-token',
  MATIC: 'matic-network', XLM: 'stellar', ALGO: 'algorand', XTZ: 'tezos', ETC: 'ethereum-classic', BCH: 'bitcoin-cash',
  HBAR: 'hedera-hashgraph', ICP: 'internet-computer', SEI: 'sei-network', TIA: 'celestia', WIF: 'dogwifcoin',
  BONK: 'bonk', JUP: 'jupiter-exchange-solana', ENA: 'ethena', ONDO: 'ondo-finance', DAI: 'dai', EURC: 'euro-coin',
};
const NAMES: Record<string, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana', XRP: 'XRP', DOGE: 'Dogecoin', FIL: 'Filecoin', PEPE: 'Pepe',
  TAO: 'Bittensor', USDC: 'USD Coin', USDT: 'Tether', ADA: 'Cardano', DOT: 'Polkadot', LINK: 'Chainlink', AVAX: 'Avalanche',
};
const STABLES = new Set(['USDC', 'USDT', 'DAI', 'EURC', 'PYUSD', 'USDG']);
const FIAT = new Set(['EUR', 'USD', 'GBP', 'CHF', 'CAD', 'JPY', 'AUD']);
const ALIASES: Record<string, string> = { XBT: 'BTC', XXBT: 'BTC', XETH: 'ETH', XDG: 'DOGE', XXDG: 'DOGE', XXRP: 'XRP', XLTC: 'LTC', XXLM: 'XLM', XETC: 'ETC', XTZ: 'XTZ' };

const num = (s?: string) => Number(String(s ?? '').replace(/,/g, '')) || 0;

/** XBT → BTC, ZEUR → EUR, ETH.S / DOT28.S (staking) → ETH / DOT. */
export function normalizeKrakenSymbol(raw: string): string {
  let s = raw.trim().toUpperCase().replace(/\d*\.(S|M|F|B|P|HOLD)$/, '');
  if (ALIASES[s]) return ALIASES[s];
  if (s.length === 4 && /^[XZ]/.test(s) && (FIAT.has(s.slice(1)) || COINGECKO_IDS[s.slice(1)])) s = s.slice(1);
  return s;
}

export function isKrakenBalances(text: string): boolean {
  const head = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0].toLowerCase();
  return head.includes('"asset"') && head.includes('quantity') && head.includes('value (usd)');
}

export function parseKrakenBalances(text: string): KrakenBalance[] {
  if (!isKrakenBalances(text)) throw new Error('Ce fichier n\'est pas un export de soldes Kraken (colonnes asset, quantity, value (USD)).');
  const out = new Map<string, KrakenBalance & { valueUsd: number }>();
  for (const r of parseCsvObjects(text)) {
    const raw = r.asset ?? '';
    const quantity = num(r.quantity);
    if (!raw || raw.toLowerCase() === 'total' || !quantity) continue;
    const symbol = normalizeKrakenSymbol(raw);
    const valueUsd = num(r['value (USD)']);
    const b = out.get(symbol) ?? { symbol, quantity: 0, priceUsd: 0, valueUsd: 0, fiat: r.subclass === 'fiat' || FIAT.has(symbol) };
    b.quantity += quantity;
    b.valueUsd += valueUsd || quantity * num(r['price (USD)']);
    b.priceUsd = b.quantity ? b.valueUsd / b.quantity : 0;
    out.set(symbol, b);
  }
  return [...out.values()].map(({ valueUsd: _v, ...b }) => b);
}

export interface KrakenOptions {
  /** Compte cible, ou 'new' pour créer « Kraken ». */
  accountId: Id | 'new';
  /** Date de l'instantané (les ajustements y sont datés). */
  date: ISODate;
  prices: PriceFile;
  /** Cours en EUR par symbole (prix de revient des ajustements). */
  eurPrices: Record<string, number>;
  /** Symbole → identifiant CoinGecko (résolus par l'interface pour les actifs absents de COINGECKO_IDS). */
  coingeckoIds: Record<string, string>;
}

export interface KrakenLine { symbol: string; name: string; target: number; current: number; delta: number; priceEur?: number; status: 'ok' | 'unchanged' | 'skipped'; reason?: string }
export interface KrakenImportResult { vault: Vault; lines: KrakenLine[]; added: number; createdAccounts: string[]; createdInstruments: string[] }

const EPS_EUR = 0.01;

/**
 * Aligne le compte sur l'instantané : pour chaque actif, ajoute un achat (ou une vente) d'ajustement
 * au cours du jour, compensé par un apport (ou un retrait). Un actif détenu absent de l'instantané est ramené à 0.
 * Réimporter le même instantané ne change rien.
 */
export function applyKraken(vault: Vault, balances: KrakenBalance[], o: KrakenOptions): KrakenImportResult {
  const v = structuredClone(vault);
  const createdAccounts: string[] = [];
  const createdInstruments: string[] = [];
  let account = v.accounts.find((a) => a.id === o.accountId);
  if (!account) {
    account = { id: newId(), name: 'Kraken', type: 'CRYPTO', institution: 'Kraken', currency: 'EUR' } as Account;
    v.accounts.push(account);
    createdAccounts.push(account.name);
  }
  const accId = account.id;
  const engine = buildEngine(vault, o.prices, o.date);
  const held = new Map<Id, number>();
  for (const p of engine.current.positions) if (p.accountId === accId) held.set(p.instrumentId, p.quantity);

  const lines: KrakenLine[] = [];
  const txs: Transaction[] = [];
  const seen = new Set<Id>();
  const adjust = (inst: Instrument, symbol: string, target: number, priceEur: number | undefined) => {
    const current = held.get(inst.id) ?? 0;
    const delta = target - current;
    const line: KrakenLine = { symbol, name: inst.name, target, current, delta, priceEur, status: 'unchanged' };
    lines.push(line);
    if (!priceEur) { if (Math.abs(delta) > 1e-12) { line.status = 'skipped'; line.reason = 'cours EUR indisponible'; } return; }
    if (Math.abs(delta) * priceEur < EPS_EUR) return;
    line.status = 'ok';
    const amount = Math.abs(delta) * priceEur;
    const base = `kraken:${o.date}:${symbol}`;
    txs.push({ id: `${base}:trade`, accountId: accId, date: o.date, type: delta > 0 ? 'BUY' : 'SELL', instrumentId: inst.id, quantity: Math.abs(delta), unitPrice: priceEur, fxRate: 1, note: 'Ajustement solde Kraken' });
    txs.push({ id: `${base}:cash`, accountId: accId, date: o.date, type: delta > 0 ? 'DEPOSIT' : 'WITHDRAWAL', amount, note: delta > 0 ? 'Apport (ajustement Kraken)' : 'Retrait (ajustement Kraken)' });
  };

  for (const b of balances) {
    if (b.fiat) {
      if (b.symbol !== 'EUR') { lines.push({ symbol: b.symbol, name: b.symbol, target: b.quantity, current: 0, delta: 0, status: 'skipped', reason: 'devise non EUR ignorée' }); continue; }
      const current = engine.current.cashByAccount[accId] ?? 0;
      const delta = Math.round((b.quantity - current) * 100) / 100;
      const line: KrakenLine = { symbol: 'EUR', name: 'Euros', target: b.quantity, current, delta, priceEur: 1, status: Math.abs(delta) < EPS_EUR ? 'unchanged' : 'ok' };
      lines.push(line);
      if (line.status === 'ok') txs.push({ id: `kraken:${o.date}:EUR`, accountId: accId, date: o.date, type: delta > 0 ? 'DEPOSIT' : 'WITHDRAWAL', amount: Math.abs(delta), note: 'Solde euros Kraken' });
      continue;
    }
    const cg = o.coingeckoIds[b.symbol] ?? COINGECKO_IDS[b.symbol];
    if (!cg) { lines.push({ symbol: b.symbol, name: b.symbol, target: b.quantity, current: 0, delta: b.quantity, status: 'skipped', reason: 'actif non reconnu' }); continue; }
    let inst = v.instruments.find((i) => i.coingeckoId === cg);
    if (!inst && b.quantity * b.priceUsd < EPS_EUR) {
      lines.push({ symbol: b.symbol, name: NAMES[b.symbol] ?? b.symbol, target: b.quantity, current: 0, delta: 0, status: 'unchanged', reason: 'poussière' });
      continue;
    }
    if (!inst) {
      inst = { id: newId(), name: NAMES[b.symbol] ?? b.symbol, kind: 'CRYPTO', assetClass: STABLES.has(b.symbol) ? 'CASH' : 'CRYPTO', currency: 'EUR', coingeckoId: cg };
      v.instruments.push(inst);
      createdInstruments.push(inst.name);
    }
    seen.add(inst.id);
    adjust(inst, b.symbol, b.quantity, o.eurPrices[b.symbol]);
  }
  // Actifs détenus sur ce compte mais absents de l'instantané : vendus entre-temps.
  for (const [instId] of held) {
    if (seen.has(instId)) continue;
    const inst = v.instruments.find((i) => i.id === instId)!;
    const sym = Object.entries(COINGECKO_IDS).find(([, id]) => id === inst.coingeckoId)?.[0] ?? inst.name.toUpperCase();
    adjust(inst, sym, 0, engine.current.positions.find((p) => p.instrumentId === instId && p.accountId === accId)?.price);
  }

  const ids = new Set(v.transactions.map((t) => t.id));
  const fresh = txs.filter((t) => !ids.has(t.id));
  v.transactions.push(...fresh);
  return { vault: parseVault(v), lines, added: fresh.length, createdAccounts, createdInstruments };
}

/** Compte Kraken existant (par établissement), sinon 'new'. */
export const defaultKrakenAccount = (v: Vault): Id | 'new' =>
  v.accounts.find((a) => /kraken/i.test(a.institution ?? a.name))?.id ?? 'new';
