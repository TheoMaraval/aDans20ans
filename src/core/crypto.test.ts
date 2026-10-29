import { describe, it, expect } from 'vitest';
import { createSessionKey, unlockSessionKey, encryptJson, decryptJson, DecryptError, isEnvelope } from './crypto';

const ITER = 1000; // rapide en test ; la prod utilise DEFAULT_ITER

describe('crypto', () => {
  it('aller-retour', async () => {
    const sk = await createSessionKey('correct horse battery staple', ITER);
    const env = await encryptJson(sk, { a: 1, s: 'é€' });
    expect(isEnvelope(env)).toBe(true);
    expect(env.ct).not.toContain('é');
    const sk2 = await unlockSessionKey('correct horse battery staple', env);
    expect(await decryptJson(sk2, env)).toEqual({ a: 1, s: 'é€' });
  });
  it('mauvaise passphrase', async () => {
    const sk = await createSessionKey('bonne passphrase longue', ITER);
    const env = await encryptJson(sk, { a: 1 });
    const bad = await unlockSessionKey('mauvaise passphrase longue', env);
    await expect(decryptJson(bad, env)).rejects.toBeInstanceOf(DecryptError);
  });
  it('IV unique à chaque chiffrement, même sel', async () => {
    const sk = await createSessionKey('une passphrase quelconque', ITER);
    const a = await encryptJson(sk, 1); const b = await encryptJson(sk, 1);
    expect(a.iv).not.toBe(b.iv); expect(a.salt).toBe(b.salt); expect(a.iter).toBe(ITER);
  });
  it('refuse une enveloppe d\'un autre sel', async () => {
    const a = await createSessionKey('pp', ITER); const b = await createSessionKey('pp', ITER);
    const env = await encryptJson(b, 1);
    await expect(decryptJson(a, env)).rejects.toThrow(/sel/);
  });
});
