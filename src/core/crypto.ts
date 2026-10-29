export const DEFAULT_ITER = 600_000;

export interface Envelope { v: 1; kdf: 'PBKDF2-SHA256'; iter: number; salt: string; iv: string; ct: string }
export interface SessionKey { key: CryptoKey; salt: string; iter: number }

export class DecryptError extends Error {
  constructor() { super('Passphrase incorrecte ou fichier corrompu'); }
}

const subtle = () => globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export function toB64(u8: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
  return btoa(s);
}
export const fromB64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const randomBytes = (n: number): Uint8Array => globalThis.crypto.getRandomValues(new Uint8Array(n));

export function isEnvelope(x: unknown): x is Envelope {
  const e = x as Envelope;
  return !!e && e.v === 1 && e.kdf === 'PBKDF2-SHA256' && typeof e.salt === 'string' && typeof e.iv === 'string' && typeof e.ct === 'string';
}

async function deriveKey(passphrase: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await subtle().importKey('raw', enc.encode(passphrase.normalize('NFC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

export async function createSessionKey(passphrase: string, iter = DEFAULT_ITER): Promise<SessionKey> {
  const salt = randomBytes(16);
  return { key: await deriveKey(passphrase, salt, iter), salt: toB64(salt), iter };
}

export async function unlockSessionKey(passphrase: string, env: Envelope): Promise<SessionKey> {
  return { key: await deriveKey(passphrase, fromB64(env.salt), env.iter), salt: env.salt, iter: env.iter };
}

export async function encryptJson(sk: SessionKey, data: unknown): Promise<Envelope> {
  const iv = randomBytes(12);
  const ct = await subtle().encrypt({ name: 'AES-GCM', iv }, sk.key, enc.encode(JSON.stringify(data)));
  return { v: 1, kdf: 'PBKDF2-SHA256', iter: sk.iter, salt: sk.salt, iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
}

export async function decryptJson<T>(sk: SessionKey, env: Envelope): Promise<T> {
  if (env.salt !== sk.salt) throw new Error('Enveloppe chiffrée avec un autre sel (passphrase changée ?)');
  try {
    const pt = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(env.iv) }, sk.key, fromB64(env.ct));
    return JSON.parse(dec.decode(pt)) as T;
  } catch {
    throw new DecryptError();
  }
}
