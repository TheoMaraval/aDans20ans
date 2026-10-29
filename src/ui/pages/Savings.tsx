import { useState } from 'react';
import { accruedInterest, balanceAt, ceilingFor } from '../../core/savings';
import { ACCOUNT_TYPE_LABELS, BALANCE_ACCOUNT_TYPES } from '../../core/types';
import { Button, Card, Empty, PageHeader, Progress, Stat } from '../components/ui';
import { EditIcon, PlusIcon } from '../components/icons';
import { useEngine, useFmt } from '../hooks';
import { upsertDated } from '../lib/collections';
import { dateFr, pct } from '../lib/format';
import { AccountSheet, DatedValueSheet } from '../sheets/EntitySheets';
import { useApp } from '../store/app';

export default function Savings() {
  const e = useEngine();
  const f = useFmt();
  const mutate = useApp((s) => s.mutate);
  const [sheet, setSheet] = useState<null | { k: 'acc'; id?: string } | { k: 'bal'; id: string }>(null);
  const accounts = e.vault.accounts.filter((a) => BALANCE_ACCOUNT_TYPES.has(a.type) && !a.archived);
  const total = accounts.reduce((s, a) => s + balanceAt(a, e.today), 0);
  const interest = accounts.reduce((s, a) => s + accruedInterest(a, e.today), 0);
  return (
    <>
      <PageHeader title="Épargne" subtitle={<>Total {f.eur(total)} · intérêts estimés {e.today.slice(0, 4)} : {f.eur(interest)}</>}
        actions={<Button size="sm" variant="primary" onClick={() => setSheet({ k: 'acc' })}><PlusIcon width={16} />Compte</Button>} />
      {!accounts.length ? <Empty title="Aucun livret ni compte courant" action={<Button variant="primary" onClick={() => setSheet({ k: 'acc' })}>Ajouter</Button>}>Livret A, LDDS, LEP, PEL, compte courant…</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {accounts.map((a) => {
            const bal = balanceAt(a, e.today);
            const ceil = ceilingFor(a);
            const r = ceil ? bal / ceil : 0;
            const last = a.balanceHistory?.at(-1);
            return (
              <Card key={a.id}>
                <div className="flex items-start justify-between">
                  <div><div className="font-semibold">{a.name}</div><div className="text-xs text-mute">{ACCOUNT_TYPE_LABELS[a.type]}{a.institution ? ` · ${a.institution}` : ''}</div></div>
                  <Button size="sm" variant="ghost" onClick={() => setSheet({ k: 'acc', id: a.id })} aria-label="Modifier"><EditIcon /></Button>
                </div>
                <div className="num my-2 text-2xl font-bold">{f.eur(bal)}</div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Taux" value={a.interestRate ? pct(a.interestRate, false) : '—'} />
                  <Stat label="Intérêts estimés" value={f.eur(accruedInterest(a, e.today))} />
                </div>
                {ceil && <div className="mt-3"><div className="mb-1 flex justify-between text-xs text-mute"><span>Plafond</span><span>{f.eur(bal)} / {f.eur(ceil)}</span></div><Progress value={r} tone={r >= 1 ? 'down' : r >= 0.9 ? 'warn' : 'accent'} /></div>}
                <div className="mt-3 flex items-center justify-between text-xs text-mute">
                  <span>Solde saisi le {dateFr(last?.date)}</span>
                  <Button size="sm" onClick={() => setSheet({ k: 'bal', id: a.id })}>Mettre à jour</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {sheet?.k === 'acc' && <AccountSheet account={e.vault.accounts.find((a) => a.id === sheet.id) ?? { type: 'LIVRET_A' }} onClose={() => setSheet(null)} />}
      {sheet?.k === 'bal' && <DatedValueSheet title="Nouveau solde" label="Solde (€)" initial={{ value: e.vault.accounts.find((a) => a.id === sheet.id)?.balanceHistory?.at(-1)?.balance }} onClose={() => setSheet(null)}
        onSubmit={(date, value) => mutate((d) => { const a = d.accounts.find((x) => x.id === sheet.id)!; a.balanceHistory = upsertDated(a.balanceHistory, { date, balance: value }); })} />}
    </>
  );
}
