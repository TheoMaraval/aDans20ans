import { useState } from 'react';
import { realEstateValueAt, realEstateYields } from '../../core/assets';
import { outstandingAt } from '../../core/loans';
import { Button, Card, Empty, PageHeader, Stat } from '../components/ui';
import { EditIcon, PlusIcon } from '../components/icons';
import { useEngine, useFmt } from '../hooks';
import { upsertDated } from '../lib/collections';
import { dateFr, pct } from '../lib/format';
import { DatedValueSheet, RealEstateSheet } from '../sheets/EntitySheets';
import { useApp } from '../store/app';

export default function RealEstatePage() {
  const e = useEngine();
  const f = useFmt();
  const mutate = useApp((s) => s.mutate);
  const [sheet, setSheet] = useState<null | { k: 'edit'; id?: string } | { k: 'val'; id: string }>(null);
  const items = e.vault.realEstate;
  const total = items.reduce((s, r) => s + realEstateValueAt(r, e.today), 0);
  return (
    <>
      <PageHeader title="Immobilier" subtitle={`Valeur (quote-part) ${f.eur(total)}`} actions={<Button size="sm" variant="primary" onClick={() => setSheet({ k: 'edit' })}><PlusIcon width={16} />Bien</Button>} />
      {!items.length ? <Empty title="Aucun bien immobilier" action={<Button variant="primary" onClick={() => setSheet({ k: 'edit' })}>Ajouter</Button>}>Résidence principale, locatif, secondaire…</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((r) => {
            const value = realEstateValueAt(r, e.today);
            const debt = r.loanIds.reduce((s, id) => { const l = e.vault.loans.find((x) => x.id === id); return s + (l ? outstandingAt(l, e.today) : 0); }, 0);
            const y = realEstateYields(r);
            const lastVal = [...r.valuations].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
            const gain = value - r.purchasePrice * r.ownershipPct;
            return (
              <Card key={r.id}>
                <div className="flex items-start justify-between">
                  <div><div className="font-semibold">{r.name}</div><div className="text-xs text-mute">{r.address}{r.surfaceM2 ? ` · ${r.surfaceM2} m²` : ''}{r.ownershipPct < 1 ? ` · ${pct(r.ownershipPct, false)} détenu` : ''}</div></div>
                  <Button size="sm" variant="ghost" onClick={() => setSheet({ k: 'edit', id: r.id })} aria-label="Modifier"><EditIcon /></Button>
                </div>
                <div className="num my-2 text-2xl font-bold">{f.eur(value)}</div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <Stat label="Équité nette" value={f.eur(value - debt)} />
                  <Stat label="Capital restant dû" value={f.eur(debt)} />
                  <Stat label="Plus-value" value={f.signed(gain)} />
                  {(r.monthlyRent ?? 0) > 0 && <Stat label="Rendement brut" value={pct(y.gross, false)} />}
                  {(r.monthlyRent ?? 0) > 0 && <Stat label="Rendement net" value={pct(y.net, false)} />}
                  {r.surfaceM2 ? <Stat label="Prix / m²" value={f.eur(value / r.ownershipPct / r.surfaceM2)} /> : null}
                </div>
                <div className="mt-3 flex items-center justify-between text-xs text-mute">
                  <span>Estimation : {lastVal ? `${dateFr(lastVal.date)}${lastVal.source ? ` (${lastVal.source})` : ''}` : 'prix d\'achat'}</span>
                  <Button size="sm" onClick={() => setSheet({ k: 'val', id: r.id })}>Nouvelle estimation</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {sheet?.k === 'edit' && <RealEstateSheet item={items.find((r) => r.id === sheet.id)} onClose={() => setSheet(null)} />}
      {sheet?.k === 'val' && <DatedValueSheet title="Estimation (valeur à 100 %)" label="Valeur du bien (€)" onClose={() => setSheet(null)}
        onSubmit={(date, value) => mutate((d) => { const r = d.realEstate.find((x) => x.id === sheet.id)!; r.valuations = upsertDated(r.valuations, { date, value }); })} />}
    </>
  );
}
