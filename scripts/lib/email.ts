import { ALERT_FAMILY_LABELS, type Alert } from '../../src/core/alerts';
import type { WeeklyReport } from '../../src/core/report';
import { ASSET_CLASS_LABELS } from '../../src/core/types';

const nbsp = (s: string) => s.replace(/[  ]/g, ' ');
export const eur = (x: number) => nbsp(`${Math.round(x).toLocaleString('fr-FR')} €`);
export const pct = (x: number | null) => (x === null ? 'n/d' : nbsp(`${x >= 0 ? '+' : ''}${(x * 100).toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`));
const frDate = (d: string) => d.split('-').reverse().join('/');
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const C = { bg: '#f4f5f7', card: '#ffffff', ink: '#111827', mute: '#6b7280', line: '#e5e7eb', up: '#047857', down: '#b91c1c', accent: '#4f46e5', warn: '#b45309' };
const color = (x: number | null) => (x === null ? C.mute : x >= 0 ? C.up : C.down);
const LEVEL = { critical: { label: 'CRITIQUE', c: C.down }, warn: { label: 'À SURVEILLER', c: C.warn }, info: { label: 'INFO', c: C.mute } } as const;

const section = (title: string, body: string) =>
  `<tr><td style="padding:20px 24px 4px;font:600 13px/1.4 system-ui,sans-serif;color:${C.mute};text-transform:uppercase;letter-spacing:.04em">${title}</td></tr>
   <tr><td style="padding:4px 24px 12px;font:14px/1.5 system-ui,sans-serif;color:${C.ink}">${body}</td></tr>`;
const row = (l: string, r: string, rc = C.ink) =>
  `<tr><td style="padding:6px 0;border-bottom:1px solid ${C.line}">${l}</td><td style="padding:6px 0;border-bottom:1px solid ${C.line};text-align:right;color:${rc};white-space:nowrap">${r}</td></tr>`;
const table = (rows: string) => `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>`;

function alertsBlock(alerts: Alert[]): string {
  if (!alerts.length) return `<span style="color:${C.up}">Rien à signaler cette semaine.</span>`;
  const groups = new Map<string, Alert[]>();
  for (const a of alerts) groups.set(a.family, [...(groups.get(a.family) ?? []), a]);
  return [...groups].map(([fam, xs]) => `<div style="margin:8px 0 4px;font-weight:600">${ALERT_FAMILY_LABELS[fam as Alert['family']]}</div>` +
    xs.map((a) => `<div style="margin:4px 0;padding:8px 10px;border-left:3px solid ${LEVEL[a.level].c};background:${C.bg}">
      <span style="font-size:11px;font-weight:700;color:${LEVEL[a.level].c}">${LEVEL[a.level].label}</span><br>
      <b>${esc(a.title)}</b><br><span style="color:${C.mute}">${esc(a.detail)}</span></div>`).join('')).join('');
}

export function renderEmail(r: WeeklyReport, url: string): { subject: string; html: string; text: string } {
  const w = r.changes[0];
  const subject = `Patrimoine · semaine du ${frDate(r.date)} · ${eur(r.net)} (${pct(w.pct)})`;
  const max = Math.max(...r.weekly.map((x) => x.net)), min = Math.min(...r.weekly.map((x) => x.net));
  const bars = r.weekly.map((x) => {
    const h = max === min ? 40 : 8 + Math.round(((x.net - min) / (max - min)) * 52);
    return `<td valign="bottom" style="padding:0 2px"><div title="${frDate(x.date)} : ${eur(x.net)}" style="height:${h}px;background:${C.accent};border-radius:3px 3px 0 0"></div></td>`;
  }).join('');
  const movers = (xs: WeeklyReport['top']) => xs.length ? table(xs.map((m) => row(esc(m.name), pct(m.pct), color(m.pct))).join('')) : `<span style="color:${C.mute}">—</span>`;
  const dca = (xs: WeeklyReport['dcaThisWeek']) => xs.length ? table(xs.map((d) => row(`${esc(d.planName)} · ${frDate(d.date)}`, eur(d.amount))).join('')) : `<span style="color:${C.mute}">Aucun</span>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:${C.bg}"><table width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:16px">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.card};border-radius:12px">
<tr><td style="padding:24px 24px 0;font:13px system-ui,sans-serif;color:${C.mute}">Semaine du ${frDate(r.date)}</td></tr>
<tr><td style="padding:4px 24px 0;font:700 32px/1.2 system-ui,sans-serif;color:${C.ink}">${eur(r.net)}</td></tr>
<tr><td style="padding:2px 24px 0;font:14px system-ui,sans-serif;color:${C.mute}">Brut ${eur(r.gross)} · Dettes ${eur(r.debts)}</td></tr>
${section('Évolution', table(r.changes.map((c) => row(`${c.label}<br><span style="color:${C.mute};font-size:12px">hors apports (${eur(c.flows)} apportés)</span>`, `${c.change >= 0 ? '+' : ''}${eur(c.change)}<br><span style="font-size:12px">${c.changeExFlows >= 0 ? '+' : ''}${eur(c.changeExFlows)} · ${pct(c.pct)}</span>`, color(c.changeExFlows))).join('')) +
  `<table width="100%" cellpadding="0" cellspacing="0" style="margin-top:12px;height:64px"><tr>${bars}</tr></table><div style="font-size:12px;color:${C.mute}">Patrimoine net, 12 dernières semaines</div>`)}
${section('Répartition', table(r.allocation.map((a) => row(ASSET_CLASS_LABELS[a.cls], `${Math.round(a.actual * 100)} %${a.target !== undefined ? ` <span style="color:${C.mute}">(cible ${Math.round(a.target * 100)} %)</span>` : ''}`)).join('')))}
${section('Positions à surveiller', alertsBlock(r.alerts))}
${section('Meilleures performances (7 j)', movers(r.top))}
${section('Moins bonnes performances (7 j)', movers(r.flop))}
${section('DCA cette semaine', dca(r.dcaThisWeek))}
${section('DCA semaine prochaine', dca(r.dcaNextWeek))}
${section('Données', `Cours mis à jour le ${r.pricesUpdatedAt ? new Date(r.pricesUpdatedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }) : 'jamais'}${r.priceErrors ? ` · <span style="color:${C.down}">${r.priceErrors} erreur(s)</span>` : ''}${r.pending.length ? ` · ${r.pending.length} échéance(s) DCA sans cours` : ''}`)}
<tr><td align="center" style="padding:16px 24px 28px"><a href="${esc(url)}" style="display:inline-block;padding:12px 22px;background:${C.accent};color:#fff;border-radius:8px;text-decoration:none;font:600 14px system-ui,sans-serif">Ouvrir le dashboard</a></td></tr>
</table></td></tr></table></body></html>`;

  const text = [
    subject, '',
    `Patrimoine net : ${eur(r.net)} (brut ${eur(r.gross)}, dettes ${eur(r.debts)})`,
    ...r.changes.map((c) => `${c.label} : ${c.change >= 0 ? '+' : ''}${eur(c.change)} · hors apports ${pct(c.pct)}`), '',
    'Positions à surveiller :',
    ...(r.alerts.length ? r.alerts.map((a) => `- [${LEVEL[a.level].label}] ${a.title} — ${a.detail}`) : ['- Rien à signaler']), '',
    'Top 7 j : ' + (r.top.map((m) => `${m.name} ${pct(m.pct)}`).join(', ') || '—'),
    'Flop 7 j : ' + (r.flop.map((m) => `${m.name} ${pct(m.pct)}`).join(', ') || '—'), '',
    `DCA cette semaine : ${r.dcaThisWeek.map((d) => `${d.planName} ${eur(d.amount)}`).join(', ') || 'aucun'}`,
    `DCA semaine prochaine : ${r.dcaNextWeek.map((d) => `${d.planName} ${eur(d.amount)}`).join(', ') || 'aucun'}`, '', url,
  ].join('\n');
  return { subject, html, text };
}
