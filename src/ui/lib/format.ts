const nf0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const MASK = '•••• €';

export const eur = (x: number, hide = false, cents = false): string =>
  hide ? MASK : (cents || Math.abs(x) < 1000 ? nf2 : nf0).format(x);

export const signedEur = (x: number, hide = false): string =>
  hide ? MASK : `${x > 0 ? '+' : x < 0 ? '−' : ''}${eur(Math.abs(x))}`;

export const money = (x: number, currency: string, hide = false): string =>
  hide ? '••••' : new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: Math.abs(x) < 10 ? 4 : 2 }).format(x);

export const pct = (x: number | null | undefined, signed = true): string =>
  x == null || !isFinite(x) ? '—'
    : `${signed && x > 0 ? '+' : ''}${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

export const qty = (x: number): string => x.toLocaleString('fr-FR', { maximumFractionDigits: 6 });

export const dateFr = (d?: string): string => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

export const dateTimeFr = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';

export const monthFr = (d: string): string =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
