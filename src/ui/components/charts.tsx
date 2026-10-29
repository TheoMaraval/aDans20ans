import { useMemo } from 'react';
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, Pie, PieChart, ReferenceDot, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ProjectionPoint } from '../../core/dca';
import { SERIES, themeColor } from '../lib/colors';
import { dateFr, eur, monthFr, MASK } from '../lib/format';
import { useUi } from '../store/ui';

function useColors() {
  const theme = useUi((s) => s.theme);
  return useMemo(() => ({
    accent: themeColor('accent'), accentFill: themeColor('accent', 0.25), mute: themeColor('mute'), line: themeColor('line'),
    surface: themeColor('surface'), ink: themeColor('ink'), up: themeColor('up'), down: themeColor('down'),
  }), [theme]);
}

function Tip({ active, payload, label, hide, fmt }: { active?: boolean; payload?: { name: string; value: number; color?: string }[]; label?: string; hide: boolean; fmt?: (x: number) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="mb-1 text-mute">{label && /^\d{4}-/.test(label) ? dateFr(label) : label}</div>
      {payload.map((p) => <div key={p.name} className="num"><span style={{ color: p.color }}>●</span> {p.name} : {hide ? MASK : (fmt ?? eur)(p.value)}</div>)}
    </div>
  );
}

const axisTick = (c: string) => ({ fill: c, fontSize: 11 });

export function NetWorthChart({ data, hide, height = 220 }: { data: { date: string; net: number }[]; hide: boolean; height?: number }) {
  const c = useColors();
  const up = data.length < 2 || data[data.length - 1].net >= data[0].net;
  const stroke = up ? c.up : c.down;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <defs><linearGradient id="nw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={stroke} stopOpacity={0.35} /><stop offset="100%" stopColor={stroke} stopOpacity={0} /></linearGradient></defs>
        <XAxis dataKey="date" tickFormatter={monthFr} tick={axisTick(c.mute)} axisLine={false} tickLine={false} minTickGap={40} />
        <YAxis hide domain={['auto', 'auto']} />
        <Tooltip content={<Tip hide={hide} />} />
        <Area type="monotone" dataKey="net" name="Net" stroke={stroke} strokeWidth={2} fill="url(#nw)" isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function Donut({ data, hide }: { data: { key: string; label: string; value: number }[]; hide: boolean }) {
  const c = useColors();
  const items = data.filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  const total = items.reduce((s, d) => s + d.value, 0);
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row">
      <div className="h-44 w-44 shrink-0">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={items} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={1.5} stroke={c.surface} isAnimationActive={false}>
              {items.map((d, i) => <Cell key={d.key} fill={SERIES[i % SERIES.length]} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="w-full space-y-1.5 text-sm">
        {items.map((d, i) => (
          <li key={d.key} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SERIES[i % SERIES.length] }} />
            <span className="flex-1 truncate">{d.label}</span>
            <span className="num text-mute">{total ? Math.round((d.value / total) * 100) : 0} %</span>
            <span className="num w-24 text-right">{eur(d.value, hide)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ProjectionChart({ data, hide }: { data: ProjectionPoint[]; hide: boolean }) {
  const c = useColors();
  const rows = data.map((p) => ({ label: `${p.year} an${p.year > 1 ? 's' : ''}`, Versé: p.invested, Gains: Math.max(0, p.value - p.invested) }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={rows} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" tick={axisTick(c.mute)} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis hide />
        <Tooltip content={<Tip hide={hide} />} cursor={{ fill: c.line, opacity: 0.3 }} />
        <Bar dataKey="Versé" stackId="a" fill={c.accent} isAnimationActive={false} />
        <Bar dataKey="Gains" stackId="a" fill={c.up} radius={[4, 4, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function PriceChart({ data, buys, currency }: { data: { date: string; value: number }[]; buys: { date: string; value: number }[]; currency: string }) {
  const c = useColors();
  const fmt = (x: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 2 }).format(x);
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tickFormatter={monthFr} tick={axisTick(c.mute)} axisLine={false} tickLine={false} minTickGap={40} />
        <YAxis domain={['auto', 'auto']} tick={axisTick(c.mute)} axisLine={false} tickLine={false} width={48} />
        <Tooltip content={<Tip hide={false} fmt={fmt} />} />
        <Line type="monotone" dataKey="value" name="Cours" stroke={c.accent} dot={false} strokeWidth={2} isAnimationActive={false} />
        {buys.map((b) => <ReferenceDot key={b.date} x={b.date} y={b.value} r={3} fill={c.up} stroke="none" />)}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BalanceChart({ data, today, hide }: { data: { date: string; value: number }[]; today: string; hide: boolean }) {
  const c = useColors();
  return (
    <ResponsiveContainer width="100%" height={160}>
      <AreaChart data={data} margin={{ top: 8, right: 0, left: 0, bottom: 0 }}>
        <XAxis dataKey="date" tickFormatter={monthFr} tick={axisTick(c.mute)} axisLine={false} tickLine={false} minTickGap={50} />
        <YAxis hide />
        <Tooltip content={<Tip hide={hide} />} />
        <Area type="monotone" dataKey="value" name="Valeur" stroke={c.accent} fill={c.accentFill} isAnimationActive={false} />
        <ReferenceLine x={data.find((d) => d.date >= today)?.date} stroke={c.mute} strokeDasharray="3 3" />
      </AreaChart>
    </ResponsiveContainer>
  );
}
