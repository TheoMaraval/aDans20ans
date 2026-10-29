import { isEnvelope, type Envelope } from '../../core/crypto';

/** Lit un fichier chiffré publié avec le site (null si absent). */
export async function fetchPagesFile(name: string): Promise<Envelope | null> {
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}${name}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    return isEnvelope(j) ? j : null;
  } catch {
    return null;
  }
}
