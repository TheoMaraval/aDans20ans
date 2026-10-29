import { useState } from 'react';
import { amortizationSchedule, loanSummary, outstandingAt } from '../../core/loans';
import { BalanceChart } from '../components/charts';
import { Button, Card, Empty, PageHeader, Progress, Stat } from '../components/ui';
import { EditIcon, PlusIcon } from '../components/icons';
import { useEngine, useFmt } from '../hooks';
import { upsertDated } from '../lib/collections';
import { dateFr, pct } from '../lib/format';
import { DatedValueSheet, LoanSheet } from '../sheets/EntitySheets';
import { useApp } from '../store/app';

export default function Debts() {
  const e = useEngine();
  const f = useFmt();
  const mutate = useApp((s) => s.mutate);
  const [sheet, setSheet] = useState<null | { k: 'edit'; id?: string } | { k: 'crd'; id: string }>(null);
  const loans = e.vault.loans;
  return (
    <>
      <PageHeader title="Dettes" subtitle={`Capital restant dû ${f.eur(e.current.debts)}`} actions={<Button size="sm" variant="primary" onClick={() => setSheet({ k: 'edit' })}><PlusIcon width={16} />Prêt</Button>} />
      {!loans.length ? <Empty title="Aucun prêt" action={<Button variant="primary" onClick={() => setSheet({ k: 'edit' })}>Ajouter</Button>}>Crédit immobilier, auto, conso, étudiant…</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {loans.map((l) => {
            const s = loanSummary(l, e.today);
            const curve = amortizationSchedule(l).filter((_, k) => k % 3 === 0).map((r) => ({ date: r.date, value: outstandingAt(l, r.date) }));
            return (
              <Card key={l.id}>
                <div className="flex items-start justify-between">
                  <div><div className="font-semibold">{l.name}</div><div className="text-xs text-mute">{f.eur(l.principal)} à {pct(l.annualRate, false)} sur {Math.round(l.durationMonths / 12)} ans</div></div>
                  <Button size="sm" variant="ghost" onClick={() => setSheet({ k: 'edit', id: l.id })} aria-label="Modifier"><EditIcon /></Button>
                </div>
                <div className="num my-2 text-2xl font-bold text-down">−{f.eur(s.outstanding)}</div>
                <Progress value={s.paidPct} tone="up" />
                <div className="mt-1 text-xs text-mute">{pct(s.paidPct, false)} remboursé · fin le {dateFr(s.endDate)}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="Mensualité" value={f.eur(s.monthlyWithInsurance, true)} sub={l.insuranceMonthly ? <span className="text-mute">dont assurance {f.eur(l.insuranceMonthly, true)}</span> : undefined} />
                  <Stat label="Intérêts totaux" value={f.eur(s.totalInterest)} />
                  <Stat label="Coût total" value={f.eur(s.totalCost)} />
                </div>
                <BalanceChart data={curve} today={e.today} hide={f.hide} />
                <div className="mt-2 text-right"><Button size="sm" onClick={() => setSheet({ k: 'crd', id: l.id })}>Corriger le CRD</Button></div>
              </Card>
            );
          })}
        </div>
      )}
      {sheet?.k === 'edit' && <LoanSheet loan={loans.find((l) => l.id === sheet.id)} onClose={() => setSheet(null)} />}
      {sheet?.k === 'crd' && <DatedValueSheet title="Capital restant dû (100 %)" label="Montant (€)" onClose={() => setSheet(null)}
        onSubmit={(date, value) => mutate((d) => { const l = d.loans.find((x) => x.id === sheet.id)!; l.manualOutstanding = upsertDated(l.manualOutstanding, { date, amount: value }); })} />}
    </>
  );
}
