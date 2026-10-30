const nf0 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const MASK = '•••• €';

const tiny = (x: number) => x !== 0 && Math.abs(x) < 0.01;
const sig = (currency: string) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumSignificantDigits: 3 });

export const eur = (x: number, hide = false, cents = false): string =>
  hide ? MASK : tiny(x) ? sig('EUR').format(x) : (cents || Math.abs(x) < 1000 ? nf2 : nf0).format(x);

export const signedEur = (x: number, hide = false): string =>
  hide ? MASK : `${x > 0 ? '+' : x < 0 ? '−' : ''}${eur(Math.abs(x))}`;

export const money = (x: number, currency: string, hide = false): string =>
  hide ? '••••' : tiny(x) ? sig(currency).format(x) : new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: Math.abs(x) < 10 ? 4 : 2 }).format(x);

export const pct = (x: number | null | undefined, signed = true): string => {
  if (x == null || !isFinite(x)) return '—';
  const v = Math.abs(x) < 0.0005 ? 0 : x; // évite « -0,0 % »
  return `${signed && v > 0 ? '+' : ''}${(v * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;
};

export const qty = (x: number): string => x.toLocaleString('fr-FR', { maximumFractionDigits: 6 });

export const dateFr = (d?: string): string => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

export const dateTimeFr = (iso?: string): string =>
  iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : 'jamais';

export const monthFr = (d: string): string =>
  new Date(`${d.slice(0, 10)}T00:00:00`).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
