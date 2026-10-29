import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { decryptJson, encryptJson, isEnvelope, unlockSessionKey, type Envelope, type SessionKey } from '../../src/core/crypto';
import { parseVault } from '../../src/core/schema';
import { emptyPriceFile, type PriceFile } from '../../src/core/prices';
import type { Vault } from '../../src/core/types';

export const DATA_DIR = 'data';

export function readEnvelope(path: string): Envelope | null {
  if (!existsSync(path)) return null;
  const j = JSON.parse(readFileSync(path, 'utf8'));
  if (!isEnvelope(j)) throw new Error(`${path} n'est pas une enveloppe chiffrée valide`);
  return j;
}

export async function saveEncrypted(sk: SessionKey, path: string, data: unknown): Promise<void> {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(await encryptJson(sk, data)) + '\n');
}

export interface OpenedData { sk: SessionKey; vault: Vault; prices: PriceFile }

/** Ouvre vault.enc (obligatoire) et prices.enc (vide si absent ou d'un autre sel). */
export async function openData(passphrase: string, dir = DATA_DIR): Promise<OpenedData> {
  const env = readEnvelope(join(dir, 'vault.enc'));
  if (!env) throw new Error(`${dir}/vault.enc introuvable : lancer « npm run init-vault »`);
  const sk = await unlockSessionKey(passphrase, env);
  const vault = parseVault(await decryptJson(sk, env));
  const penv = readEnvelope(join(dir, 'prices.enc'));
  let prices = emptyPriceFile();
  if (penv && penv.salt === sk.salt) prices = { ...emptyPriceFile(), ...(await decryptJson<PriceFile>(sk, penv)) };
  return { sk, vault, prices };
}

export function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variable d'environnement ${name} manquante`);
  return v;
}
