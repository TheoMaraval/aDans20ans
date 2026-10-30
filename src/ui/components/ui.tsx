import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { Alert } from '../../core/alerts';
import { pct } from '../lib/format';

export function Card({ className = '', children, ...p }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`rounded-2xl border border-line bg-surface p-4 ${className}`} {...p}>{children}</div>;
}

type Variant = 'primary' | 'ghost' | 'danger' | 'soft';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-white hover:opacity-90',
  ghost: 'text-ink hover:bg-surface2',
  soft: 'bg-surface2 text-ink hover:bg-line',
  danger: 'bg-down/15 text-down hover:bg-down/25',
};
export function Button({ variant = 'soft', size = 'md', className = '', ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return <button className={`inline-flex items-center justify-center gap-1.5 rounded-xl font-medium transition disabled:opacity-50 ${size === 'sm' ? 'px-2.5 py-1.5 text-sm' : 'px-4 py-2.5'} ${VARIANTS[variant]} ${className}`} {...p} />;
}

export function Badge({ tone = 'mute', children }: { tone?: 'mute' | 'up' | 'down' | 'warn' | 'accent'; children: ReactNode }) {
  const t = { mute: 'bg-surface2 text-mute', up: 'bg-up/15 text-up', down: 'bg-down/15 text-down', warn: 'bg-warn/15 text-warn', accent: 'bg-accent/15 text-accent' }[tone];
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${t}`}>{children}</span>;
}

export const toneOf = (x: number | null | undefined) => (x == null || x === 0 ? 'text-mute' : x > 0 ? 'text-up' : 'text-down');

export function Delta({ value, children, className = '' }: { value: number | null | undefined; children?: ReactNode; className?: string }) {
  return <span className={`num ${toneOf(value)} ${className}`}>{children ?? pct(value)}</span>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-mute">{label}</div>
      <div className="num truncate text-lg font-semibold">{value}</div>
      {sub && <div className="text-xs">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl font-bold tracking-tight">{title}</h1>{subtitle && <div className="text-sm text-mute">{subtitle}</div>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="mb-2 mt-6 flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-wide text-mute">{children}</h2>{action}</div>;
}

export function Tabs<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="scrollbar-none -mx-1 flex gap-1 overflow-x-auto px-1">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${o.value === value ? 'bg-accent text-white' : 'bg-surface2 text-mute hover:text-ink'}`}>{o.label}</button>
      ))}
    </div>
  );
}

export function Progress({ value, tone = 'accent' }: { value: number; tone?: 'accent' | 'warn' | 'down' | 'up' }) {
  const c = { accent: 'bg-accent', warn: 'bg-warn', down: 'bg-down', up: 'bg-up' }[tone];
  return <div className="h-2 w-full overflow-hidden rounded-full bg-surface2"><div className={`h-full ${c}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} /></div>;
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card className="flex flex-col items-center gap-2 py-10 text-center">
      <div className="text-base font-semibold">{title}</div>
      {children && <div className="max-w-sm text-sm text-mute">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </Card>
  );
}

export function AlertItem({ a }: { a: Alert }) {
  // Variations : vert à la hausse, rouge à la baisse ; autres alertes : couleur de gravité.
  const c = a.tone ? (a.tone === 'up' ? 'border-up' : 'border-down') : { critical: 'border-down', warn: 'border-warn', info: 'border-line' }[a.level];
  const pctMatch = a.tone ? a.title.match(/^(.*?)([+-]\d[\d\s,]*\s?%)(.*)$/) : null;
  return (
    <div className={`rounded-xl border-l-4 ${c} bg-surface2 px-3 py-2`}>
      <div className="text-sm font-medium">
        {pctMatch ? <>{pctMatch[1]}<span className={a.tone === 'up' ? 'text-up' : 'text-down'}>{pctMatch[2]}</span>{pctMatch[3]}</> : a.title}
      </div>
      <div className="text-xs text-mute">{a.detail}</div>
    </div>
  );
}

export function Row({ left, right, sub, subRight, onClick }: { left: ReactNode; right: ReactNode; sub?: ReactNode; subRight?: ReactNode; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`flex w-full items-center justify-between gap-3 border-b border-line py-3 text-left last:border-0 ${onClick ? 'hover:bg-surface2/50' : ''}`}>
      <div className="min-w-0"><div className="truncate font-medium">{left}</div>{sub && <div className="truncate text-xs text-mute">{sub}</div>}</div>
      <div className="shrink-0 text-right"><div className="num font-medium">{right}</div>{subRight && <div className="num text-xs">{subRight}</div>}</div>
    </Tag>
  );
}
