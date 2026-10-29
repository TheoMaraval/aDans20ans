import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionKey } from '../../src/core/crypto';
import { emptyVault } from '../../src/core/defaults';
import { emptyPriceFile } from '../../src/core/prices';
import { openData, saveEncrypted } from './files';

describe('files', () => {
  it('écrit puis rouvre vault et prix', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fp-'));
    const sk = await createSessionKey('passphrase de test assez longue', 1000);
    await saveEncrypted(sk, join(dir, 'vault.enc'), emptyVault());
    const r = await openData('passphrase de test assez longue', dir);
    expect(r.vault.version).toBe(1);
    expect(r.prices).toEqual(emptyPriceFile());
    await saveEncrypted(r.sk, join(dir, 'prices.enc'), { ...emptyPriceFile(), updatedAt: 'x' });
    expect((await openData('passphrase de test assez longue', dir)).prices.updatedAt).toBe('x');
  });
  it('mauvaise passphrase', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'fp-'));
    await saveEncrypted(await createSessionKey('aaaaaaaaaaaaaaaa', 1000), join(dir, 'vault.enc'), emptyVault());
    await expect(openData('bbbbbbbbbbbbbbbb', dir)).rejects.toThrow(/Passphrase/);
  });
});
