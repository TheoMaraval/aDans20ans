import type { ISODate } from './dates';
import { expandTransactions } from './dca';
import { createPriceBook, type PriceBook, type PriceFile, type Quote } from './prices';
import { valueAt, type ValuationContext } from './valuation';
import type { NetWorthBreakdown, PendingDca, Transaction, Vault } from './types';

export interface Engine {
  vault: Vault; prices: PriceFile; today: ISODate;
  book: PriceBook; transactions: Transaction[]; pendingDca: PendingDca[];
  ctx: ValuationContext; current: NetWorthBreakdown;
}

export function buildEngine(vault: Vault, prices: PriceFile, today: ISODate, live: Record<string, Quote> = {}): Engine {
  const book = createPriceBook(prices, vault.transactions, today, live);
  const { transactions, pending } = expandTransactions(vault, book, today);
  const ctx: ValuationContext = { vault, book, transactions };
  return { vault, prices, today, book, transactions, pendingDca: pending, ctx, current: valueAt(ctx, today) };
}
