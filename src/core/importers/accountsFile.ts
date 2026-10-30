import { z } from 'zod';
import type { ISODate } from '../dates';
import { newId } from '../defaults';
import { accountTypeSchema, parseVault } from '../schema';
import type { Account, Vault } from '../types';

/** Fichier de comptes à solde (livrets, comptes courants…) préparé hors de l'app, fusionné à l'import. */
export const FORMAT = 'patrimoine-comptes/1';

const fileSchema = z.object({
  format: z.literal(FORMAT),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  accounts: z.array(z.object({
    name: z.string().min(1),
    type: accountTypeSchema,
    institution: z.string().optional(),
    balance: z.number().finite(),
    interestRate: z.number().min(0).max(1).optional(),
  })).min(1),
});
export type AccountsFile = z.infer<typeof fileSchema>;

export function isAccountsFile(text: string): boolean {
  try { return JSON.parse(text)?.format === FORMAT; } catch { return false; }
}

export function parseAccountsFile(text: string): AccountsFile {
  const r = fileSchema.safeParse(JSON.parse(text));
  if (!r.success) throw new Error(`Fichier de comptes invalide : ${r.error.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', ')}`);
  return r.data;
}

const key = (name: string, institution?: string) => `${name.trim().toLowerCase()}|${(institution ?? '').trim().toLowerCase()}`;

/** Crée les comptes absents, et enregistre le solde (daté) des comptes existants de même nom et établissement. */
export function applyAccountsFile(vault: Vault, f: AccountsFile, today: ISODate): { vault: Vault; created: string[]; updated: string[] } {
  const v = structuredClone(vault);
  const date = f.date ?? today;
  const created: string[] = [], updated: string[] = [];
  for (const a of f.accounts) {
    let target = v.accounts.find((x) => key(x.name, x.institution) === key(a.name, a.institution));
    if (!target) {
      target = { id: newId(), name: a.name, type: a.type, institution: a.institution, currency: 'EUR', interestRate: a.interestRate } as Account;
      v.accounts.push(target);
      created.push(a.name);
    } else {
      if (a.interestRate !== undefined) target.interestRate = a.interestRate;
      updated.push(a.name);
    }
    target.balanceHistory = [...(target.balanceHistory ?? []).filter((b) => b.date !== date), { date, balance: a.balance }]
      .sort((x, y) => x.date.localeCompare(y.date));
  }
  return { vault: parseVault(v), created, updated };
}
