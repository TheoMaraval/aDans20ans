import { useState } from 'react';
import { addDays, addMonths } from '../../core/dates';
import { monthlyEquivalent, projectDca, scheduleDates } from '../../core/dca';
import type { DcaPlan, Transaction } from '../../core/types';
import { ProjectionChart } from '../components/charts';
import { Badge, Button, Card, Delta, Empty, PageHeader, Row, SectionTitle, Stat, Tabs } from '../components/ui';
import { EditIcon, PlusIcon } from '../components/icons';
import { useEngine, useFmt } from '../hooks';
import { dateFr, pct, qty } from '../lib/format';
import { DcaPlanSheet, TransactionSheet } from '../sheets/EntitySheets';

const FREQ = { WEEKLY: '/ semaine', BIWEEKLY: '/ 2 semaines', MONTHLY: '/ mois', QUARTERLY: '/ trimestre' };

export default function Dca() {
  const e = useEngine();
  const f = useFmt();
  const [years, setYears] = useState<'5' | '10' | '20'>('10');
  const [sheet, setSheet] = useState<null | { k: 'plan'; id?: string } | { k: 'fix'; tx: Partial<Transaction> }>(null);
  const plans = e.vault.dcaPlans;

  const stats = (p: DcaPlan) => {
    const buys = e.transactions.filter((t) => t.dcaPlanId === p.id && t.type === 'BUY');
    const invested = buys.reduce((s, t) => s + (t.quantity ?? 0) * (t.unitPrice ?? 0) * (t.fxRate ?? 1) + (t.fees ?? 0), 0);
    const units = buys.reduce((s, t) => s + (t.quantity ?? 0), 0);
    const pos = e.current.positions.find((x) => x.accountId === p.accountId && x.instrumentId === p.instrumentId);
    const value = pos ? units * pos.price * e.book.fxAt(pos.currency, e.today) : 0;
    const next = scheduleDates(p, addDays(e.today, 1), addMonths(e.today, 4))[0];
    return { buys, invested, units, value, next, active: !p.pausedFrom && (!p.endDate || p.endDate >= e.today) };
  };
  const all = plans.map((p) => ({ p, s: stats(p) }));
  const totalInvested = all.reduce((s, x) => s + x.s.invested, 0);
  const totalValue = all.reduce((s, x) => s + x.s.value, 0);
  const monthly = all.filter((x) => x.s.active).reduce((s, x) => s + monthlyEquivalent(x.p), 0);
  const avgReturn = all.length ? all.reduce((s, x) => s + (x.p.expectedAnnualReturn ?? 0.07) * Math.max(1, x.s.value), 0) / all.reduce((s, x) => s + Math.max(1, x.s.value), 0) : 0.07;
  const projection = projectDca(totalValue, monthly, avgReturn, Number(years));

  return (
    <>
      <PageHeader title="DCA" subtitle={`${f.eur(monthly)} investis par mois`} actions={<Button size="sm" variant="primary" onClick={() => setSheet({ k: 'plan' })}><PlusIcon width={16} />Plan</Button>} />
      {!plans.length ? <Empty title="Aucun plan DCA" action={<Button variant="primary" onClick={() => setSheet({ k: 'plan' })}>Créer un plan</Button>}>Déclare tes investissements programmés : les achats sont enregistrés automatiquement au cours de clôture.</Empty> : (
        <>
          <Card className="mb-4">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Total versé" value={f.eur(totalInvested)} />
              <Stat label="Valeur actuelle" value={f.eur(totalValue)} />
              <Stat label="Plus-value" value={<Delta value={totalValue - totalInvested}>{f.signed(totalValue - totalInvested)}</Delta>} sub={<Delta value={totalInvested ? totalValue / totalInvested - 1 : 0} />} />
              <Stat label="Rendement supposé" value={pct(avgReturn, false)} />
            </div>
            <div className="mb-2 mt-5 flex items-center justify-between"><h2 className="font-semibold">Projection</h2>
              <Tabs options={[{ value: '5', label: '5 ans' }, { value: '10', label: '10 ans' }, { value: '20', label: '20 ans' }]} value={years} onChange={setYears} /></div>
            <ProjectionChart data={projection} hide={f.hide} />
            <div className="text-sm text-mute">Dans {years} ans : <b className="text-ink">{f.eur(projection.at(-1)!.value)}</b> dont {f.eur(projection.at(-1)!.invested)} versés (hypothèse, non garantie).</div>
          </Card>

          {e.pendingDca.length > 0 && (
            <>
              <SectionTitle>Échéances sans cours</SectionTitle>
              <Card>{e.pendingDca.map((x) => { const p = plans.find((pl) => pl.id === x.planId)!; return (
                <Row key={x.planId + x.date} left={p.name} sub={dateFr(x.date)} right={<Button size="sm" onClick={() => setSheet({ k: 'fix', tx: { accountId: p.accountId, instrumentId: p.instrumentId, type: 'BUY', date: x.date, dcaPlanId: p.id, dcaDate: x.date } })}>Saisir</Button>} />); })}</Card>
            </>
          )}

          <SectionTitle>Plans</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            {all.map(({ p, s }) => (
              <Card key={p.id}>
                <div className="flex items-start justify-between">
                  <div><div className="font-semibold">{p.name} {!s.active && <Badge>{p.pausedFrom ? 'en pause' : 'terminé'}</Badge>}</div>
                    <div className="text-xs text-mute">{f.eur(p.amount)} {FREQ[p.frequency]} · {e.vault.accounts.find((a) => a.id === p.accountId)?.name}</div></div>
                  <Button size="sm" variant="ghost" onClick={() => setSheet({ k: 'plan', id: p.id })} aria-label="Modifier"><EditIcon /></Button>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Stat label="Versé" value={f.eur(s.invested)} />
                  <Stat label="Valeur" value={f.eur(s.value)} sub={<Delta value={s.invested ? s.value / s.invested - 1 : 0} />} />
                  <Stat label="Titres" value={qty(s.units)} />
                </div>
                <div className="mt-2 text-xs text-mute">{s.next ? `Prochaine échéance : ${dateFr(s.next)}` : 'Pas d\'échéance à venir'} · {s.buys.length} achats</div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-accent">Derniers achats</summary>
                  {s.buys.slice(-6).reverse().map((t) => (
                    <Row key={t.id} left={dateFr(t.date)} sub={t.virtual ? 'auto (clôture)' : 'corrigé'} right={`${qty(t.quantity ?? 0)} × ${f.money(t.unitPrice ?? 0, e.vault.instruments.find((i) => i.id === p.instrumentId)?.currency ?? 'EUR')}`}
                      subRight={<button className="text-accent" onClick={() => setSheet({ k: 'fix', tx: t.virtual ? { ...t, id: undefined, virtual: undefined } : t })}>Corriger</button>} />
                  ))}
                </details>
              </Card>
            ))}
          </div>
        </>
      )}
      {sheet?.k === 'plan' && <DcaPlanSheet plan={plans.find((p) => p.id === sheet.id)} onClose={() => setSheet(null)} />}
      {sheet?.k === 'fix' && <TransactionSheet tx={sheet.tx} onClose={() => setSheet(null)} />}
    </>
  );
}
