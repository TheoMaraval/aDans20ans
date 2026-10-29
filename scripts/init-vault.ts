// Usage : npm run init-vault  |  npm run demo   (VAULT_PASSPHRASE peut être fourni par l'environnement)
import { createInterface } from 'node:readline/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { zxcvbn, zxcvbnOptions } from '@zxcvbn-ts/core';
import * as common from '@zxcvbn-ts/language-common';
import { createSessionKey } from '../src/core/crypto';
import { emptyVault } from '../src/core/defaults';
import { todayParis } from '../src/core/dates';
import { emptyPriceFile } from '../src/core/prices';
import { parseVault } from '../src/core/schema';
import { demoVault } from './lib/demo';
import { DATA_DIR, saveEncrypted } from './lib/files';

zxcvbnOptions.setOptions({ dictionary: common.dictionary, graphs: common.adjacencyGraphs });

async function main() {
  const demo = process.argv.includes('--demo');
  const force = process.argv.includes('--force');
  const vaultPath = join(DATA_DIR, 'vault.enc');
  if (existsSync(vaultPath) && !force) throw new Error(`${vaultPath} existe déjà (ajouter --force pour l'écraser)`);
  let pass = process.env.VAULT_PASSPHRASE;
  if (!pass) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    pass = await rl.question('Passphrase (≥ 16 caractères, plusieurs mots) : ');
    const again = await rl.question('Confirmer : ');
    rl.close();
    if (pass !== again) throw new Error('Les passphrases ne correspondent pas');
  }
  if (pass.length < 16 || zxcvbn(pass).score < 3) throw new Error('Passphrase trop faible : au moins 16 caractères et score zxcvbn ≥ 3');
  const sk = await createSessionKey(pass);
  const vault = parseVault(demo ? demoVault(todayParis()) : emptyVault());
  await saveEncrypted(sk, vaultPath, vault);
  await saveEncrypted(sk, join(DATA_DIR, 'prices.enc'), emptyPriceFile());
  console.log(`✔ ${vaultPath} et prices.enc créés${demo ? ' (données de démo)' : ''}. Pensez au secret GitHub VAULT_PASSPHRASE.`);
}
main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
