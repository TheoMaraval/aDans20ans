import { decryptJson, encryptJson, isEnvelope, type SessionKey } from '../../core/crypto';

const KEY = 'fp.gh';

export async function storeToken(sk: SessionKey, token: string): Promise<void> {
  try { localStorage.setItem(KEY, JSON.stringify(await encryptJson(sk, token))); } catch { /* stockage indisponible */ }
}

export async function loadToken(sk: SessionKey): Promise<string | undefined> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return undefined;
    const env = JSON.parse(raw);
    if (!isEnvelope(env) || env.salt !== sk.salt) return undefined;
    return await decryptJson<string>(sk, env);
  } catch {
    return undefined;
  }
}

export function clearToken(): void {
  try { localStorage.removeItem(KEY); } catch { /* rien */ }
}
