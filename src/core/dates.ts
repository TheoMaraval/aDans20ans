export type ISODate = string;
const DAY = 86_400_000;

export const toDate = (d: ISODate): Date => new Date(`${d.slice(0, 10)}T00:00:00Z`);
export const fmt = (d: Date): ISODate => d.toISOString().slice(0, 10);
export const addDays = (d: ISODate, n: number): ISODate => fmt(new Date(toDate(d).getTime() + n * DAY));
export const daysBetween = (a: ISODate, b: ISODate): number =>
  Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
export const yearsBetween = (a: ISODate, b: ISODate): number => daysBetween(a, b) / 365.25;

export function addMonths(d: ISODate, n: number): ISODate {
  const x = toDate(d);
  const day = x.getUTCDate();
  const t = new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return fmt(t);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export const isWeekend = (d: ISODate): boolean => {
  const w = toDate(d).getUTCDay();
  return w === 0 || w === 6;
};
/** 1 = lundi … 7 = dimanche */
export const isoWeekday = (d: ISODate): number => ((toDate(d).getUTCDay() + 6) % 7) + 1;

/** Date du jour à Paris. */
export const todayParis = (now: Date = new Date()): ISODate =>
  now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });

export type Series = Record<ISODate, number>;
// Les séries sont considérées immuables une fois construites (le cache de clés en dépend).
const keyCache = new WeakMap<Series, ISODate[]>();
function sortedKeys(s: Series): ISODate[] {
  let k = keyCache.get(s);
  if (!k) { k = Object.keys(s).sort(); keyCache.set(s, k); }
  return k;
}

export function lastOnOrBefore(s: Series | undefined, d: ISODate): { date: ISODate; value: number } | null {
  if (!s) return null;
  const k = sortedKeys(s);
  let lo = 0, hi = k.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (k[mid] <= d) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans < 0 ? null : { date: k[ans], value: s[k[ans]] };
}

export function firstOnOrAfter(s: Series | undefined, d: ISODate): { date: ISODate; value: number } | null {
  if (!s) return null;
  const k = sortedKeys(s);
  let lo = 0, hi = k.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (k[mid] >= d) { ans = mid; hi = mid - 1; } else lo = mid + 1;
  }
  return ans < 0 ? null : { date: k[ans], value: s[k[ans]] };
}

export function lastEntryOnOrBefore<T extends { date: ISODate }>(arr: T[] | undefined, d: ISODate): T | undefined {
  let best: T | undefined;
  for (const e of arr ?? []) if (e.date <= d && (!best || e.date >= best.date)) best = e;
  return best;
}
