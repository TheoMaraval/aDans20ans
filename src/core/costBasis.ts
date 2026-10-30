import type { ISODate } from './dates';
import { runLedger } from './positions';
import { createPriceBook, emptyPriceFile } from './prices';
import type { Id, Transaction, Vault } from './types';

/** Achats d'ajustement créés par l'import des soldes Kraken (prix de revient = cours du jour de l'import). */
export const adjustableBuys = (v: Vault, accountId: Id, instrumentId: Id): Transaction[] =>
  v.transactions.filter((t) => t.type === 'BUY' && t.id.startsWith('kraken:') && t.accountId === accountId && t.instrumentId === instrumentId);

/**
 * Fixe le coût de revient total (EUR) d'une position à une date, en recalculant le prix des achats
 * d'ajustement Kraken et le versement associé à chacun (les espèces du compte restent inchangées).
 * Le coût de revient est linéaire en le facteur appliqué aux prix : deux calculs suffisent.
 */
export function setPositionCost(v: Vault, accountId: Id, instrumentId: Id, targetCost: number, date: ISODate): Vault {
  const buys = new Set(adjustableBuys(v, accountId, instrumentId).map((t) => t.id));
  if (!buys.size) throw new Error('Cette position n\'a pas d\'achat d\'ajustement Kraken à corriger.');
  const accounts = new Map(v.accounts.map((a) => [a.id, a]));
  const instruments = new Map(v.instruments.map((i) => [i.id, i]));
  const book = createPriceBook(emptyPriceFile(), [], date);
  const scaled = (k: number) => v.transactions.map((t) => (buys.has(t.id) ? { ...t, unitPrice: (t.unitPrice ?? 0) * k } : t));
  const costAt = (k: number) => runLedger(scaled(k), accounts, instruments, book, date).positions
    .find((p) => p.accountId === accountId && p.instrumentId === instrumentId)?.costBasis ?? 0;
  const c0 = costAt(0), c1 = costAt(1);
  if (Math.abs(c1 - c0) < 1e-9) throw new Error('Position sans quantité à cette date.');
  const k = (targetCost - c0) / (c1 - c0);
  if (!(k >= 0) || !isFinite(k)) throw new Error('Coût de revient impossible pour cette position.');

  const out = structuredClone(v);
  const cashFor = new Map<Id, number>();
  for (const t of out.transactions) {
    if (!buys.has(t.id)) continue;
    t.unitPrice = (t.unitPrice ?? 0) * k;
    // Montant exact (pas d'arrondi au centime) : les espèces du compte restent exactement à l'équilibre.
    cashFor.set(t.id.replace(/:trade$/, ':cash'), (t.quantity ?? 0) * t.unitPrice);
  }
  for (const t of out.transactions) if (cashFor.has(t.id)) t.amount = cashFor.get(t.id);
  return out;
}
