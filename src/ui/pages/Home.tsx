import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { computeAlerts } from '../../core/alerts';
import { addDays, addMonths } from '../../core/dates';
import { scheduleDates } from '../../core/dca';
import { externalFlows, periodChange } from '../../core/performance';
import { ASSET_CLASS_LABELS, BALANCE_ACCOUNT_TYPES, GROUP_LABELS, type AssetClass, type GroupKey } from '../../core/types';
import { Donut, NetWorthChart } from '../components/charts';
import { PricesStatus } from '../components/PricesStatus';
import { AlertItem, Button, Card, Delta, Empty, PageHeader, Row, SectionTitle, Tabs } from '../components/ui';
import { useEngine, useFmt, useHistory } from '../hooks';
import { dateFr, pct } from '../lib/format';

type Range = '1S' | '1M' | 'YTD' | '1A' | 'MAX';
const RANGES: { value: Range; label: string }[] = [{ value: '1S', label: '1S' }, { value: '1M', label: '1M' }, { value: 'YTD', label: 'YTD' }, { value: '1A', label: '1A' }, { value: 'MAX', label: 'Max' }];

const groupLink = (k: string) => k === 'IMMOBILIER' ? '/immobilier' : k === 'BIENS' ? '/biens' : BALANCE_ACCOUNT_TYPES.has(k as never) ? '/epargne' : '/investissements';

export default function Home() {
  const e = useEngine();
  const f = useFmt();
  const history = useHistory();
  const [range, setRange] = useState<Range>('1A');
  const [split, setSplit] = useState<'class' | 'group'>('class');
  const cur = e.current;
  const alerts = useMemo(() => computeAlerts(e), [e]);

  const start = range === '1S' ? addDays(e.today, -7) : range === '1M' ? addMonths(e.today, -1) : range === 'YTD' ? `${Number(e.today.slice(0, 4)) - 1}-12-31` : range === '1A' ? addMonths(e.today, -12) : '0000';
  const pts = history.filter((s) => s.date >= start);
  const first = pts[0];
  const change = first && pts.length > 1 ? periodChange(first.net, cur.net, externalFlows(e.ctx, first.date, e.today)) : null;

  const donut = split === 'class'
    ? Object.entries(cur.byClass).map(([k, v]) => ({ key: k, label: ASSET_CLASS_LABELS[k as AssetClass], value: v ?? 0 }))
    : Object.entries(cur.byGroup).map(([k, v]) => ({ key: k, label: GROUP_LABELS[k as GroupKey], value: v ?? 0 }));
  const groups = Object.entries(cur.byGroup).filter(([, v]) => (v ?? 0) !== 0).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0));
  const upcoming = e.vault.dcaPlans.flatMap((p) => scheduleDates(p, addDays(e.today, 1), addDays(e.today, 14)).map((d) => ({ d, p }))).sort((a, b) => a.d.localeCompare(b.d)).slice(0, 5);
  const movers = cur.positions.filter((p) => p.changePct1d != null).sort((a, b) => Math.abs(b.changePct1d!) - Math.abs(a.changePct1d!)).slice(0, 5);
  const empty = !e.vault.accounts.length && !e.vault.realEstate.length && !e.vault.physicalAssets.length;

  if (empty) return (
    <>
      <PageHeader title="Bienvenue 👋" />
      <Empty title="Ton patrimoine est vide" action={<div className="flex flex-wrap justify-center gap-2">
        <Link to="/investissements"><Button variant="primary">Importer Trade Republic / ajouter un compte</Button></Link>
        <Link to="/immobilier"><Button>Ajouter un bien</Button></Link>
        <Link to="/reglages"><Button>Connecter GitHub</Button></Link>
      </div>}>Commence par créer tes comptes (PEA, CTO, livrets…), tes biens et tes prêts. Pense à connecter GitHub dans Réglages pour enregistrer.</Empty>
    </>
  );

  return (
    <>
      <section className="mb-4">
        <div className="text-sm text-mute">Patrimoine net</div>
        <div className="num text-4xl font-bold tracking-tight md:text-5xl">{f.eur(cur.net)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 text-sm">
          {change && <Delta value={change.changeExFlows}>{f.signed(change.changeExFlows)} ({pct(change.pct)})</Delta>}
          {change && <span className="text-mute">hors apports · {f.signed(change.flows)} apportés</span>}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-1 text-xs text-mute">Brut {f.eur(cur.gross)} · Dettes {f.eur(cur.debts)} · <PricesStatus /></div>
      </section>

      <Card className="mb-4">
        <div className="mb-2"><Tabs options={RANGES} value={range} onChange={setRange} /></div>
        {pts.length > 1 ? <NetWorthChart data={pts} hide={f.hide} /> : <div className="py-16 text-center text-sm text-mute">Pas encore d'historique sur cette période.</div>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">Répartition</h2>
            <Tabs options={[{ value: 'class', label: 'Classes' }, { value: 'group', label: 'Enveloppes' }]} value={split} onChange={setSplit} /></div>
          <Donut data={donut} hide={f.hide} />
        </Card>
        <Card>
          <h2 className="mb-2 font-semibold">Par catégorie</h2>
          {groups.map(([k, v]) => <Link key={k} to={groupLink(k)}><Row left={GROUP_LABELS[k as GroupKey]} right={f.eur(v ?? 0)} subRight={<span className="text-mute">{cur.gross ? Math.round(((v ?? 0) / cur.gross) * 100) : 0} %</span>} /></Link>)}
          {cur.debts > 0 && <Link to="/dettes"><Row left="Dettes" right={<span className="text-down">−{f.eur(cur.debts)}</span>} /></Link>}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <SectionTitle>Alertes</SectionTitle>
          <div className="space-y-2">{alerts.length ? alerts.slice(0, 8).map((a) => <AlertItem key={a.id} a={a} />) : <Card className="text-sm text-up">Rien à signaler.</Card>}</div>
        </div>
        <div>
          <SectionTitle>Variations du jour</SectionTitle>
          <Card>{movers.length ? movers.map((p) => <Row key={`${p.accountId}${p.instrumentId}`} left={p.name} sub={f.eur(p.value)} right={<Delta value={p.changePct1d} />} />) : <div className="text-sm text-mute">Pas de cotation du jour.</div>}</Card>
        </div>
        <div>
          <SectionTitle action={<Link to="/dca" className="text-sm text-accent">Voir</Link>}>Prochains DCA</SectionTitle>
          <Card>{upcoming.length ? upcoming.map(({ d, p }) => <Row key={p.id + d} left={p.name} sub={dateFr(d)} right={f.eur(p.amount)} />) : <div className="text-sm text-mute">Aucune échéance sous 14 jours.</div>}</Card>
        </div>
      </div>
    </>
  );
}
