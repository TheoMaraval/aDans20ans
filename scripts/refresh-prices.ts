import { join } from 'node:path';
import { todayParis } from '../src/core/dates';
import { fetchCoingeckoHistory, fetchCoingeckoQuotes } from './lib/coingecko';
import { DATA_DIR, openData, requireEnv, saveEncrypted } from './lib/files';
import { fetchFx } from './lib/fx';
import { refreshPrices } from './lib/refresh';
import { fetchYahoo } from './lib/yahoo';

async function main() {
  const { sk, vault, prices } = await openData(requireEnv('VAULT_PASSPHRASE'));
  const today = todayParis();
  const f = globalThis.fetch;
  const next = await refreshPrices(vault, prices, today, {
    yahoo: (s, from) => fetchYahoo(f, s, from),
    cgQuotes: (ids) => fetchCoingeckoQuotes(f, ids),
    cgHistory: (id, from, t) => fetchCoingeckoHistory(f, id, from, t),
    fx: (c, from) => fetchFx(f, c, from),
    pauseMs: 300,
  });
  await saveEncrypted(sk, join(DATA_DIR, 'prices.enc'), next);
  console.log(`✔ ${Object.keys(next.quotes).length} cotations, ${next.errors.length} erreur(s)`);
  for (const e of next.errors) console.warn(`  ⚠ ${e.symbol} : ${e.message}`);
}
main().catch((e) => { console.error(`✖ ${e.message}`); process.exit(1); });
