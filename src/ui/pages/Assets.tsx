import { useState } from 'react';
import { physicalValueAt } from '../../core/assets';
import { addMonths } from '../../core/dates';
import { BalanceChart } from '../components/charts';
import { Button, Card, Empty, PageHeader, Stat } from '../components/ui';
import { EditIcon, PlusIcon } from '../components/icons';
import { useEngine, useFmt } from '../hooks';
import { upsertDated } from '../lib/collections';
import { pct } from '../lib/format';
import { DatedValueSheet, PhysicalAssetSheet } from '../sheets/EntitySheets';
import { useApp } from '../store/app';

export default function Assets() {
  const e = useEngine();
  const f = useFmt();
  const mutate = useApp((s) => s.mutate);
  const [sheet, setSheet] = useState<null | { k: 'edit'; id?: string } | { k: 'val'; id: string }>(null);
  const items = e.vault.physicalAssets;
  const total = items.reduce((s, a) => s + physicalValueAt(a, e.today), 0);
  return (
    <>
      <PageHeader title="Véhicules & biens" subtitle={`Valeur estimée ${f.eur(total)}`} actions={<Button size="sm" variant="primary" onClick={() => setSheet({ k: 'edit' })}><PlusIcon width={16} />Bien</Button>} />
      {!items.length ? <Empty title="Aucun bien" action={<Button variant="primary" onClick={() => setSheet({ k: 'edit' })}>Ajouter</Button>}>Voiture, moto, montre, or physique, œuvre d'art…</Empty> : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((a) => {
            const value = physicalValueAt(a, e.today);
            const curve = Array.from({ length: 25 }, (_, k) => addMonths(a.purchaseDate, k * 3)).map((date) => ({ date, value: physicalValueAt(a, date) }));
            return (
              <Card key={a.id}>
                <div className="flex items-start justify-between">
                  <div className="font-semibold">{a.name}</div>
                  <Button size="sm" variant="ghost" onClick={() => setSheet({ k: 'edit', id: a.id })} aria-label="Modifier"><EditIcon /></Button>
                </div>
                <div className="num my-2 text-2xl font-bold">{f.eur(value)}</div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Prix d'achat" value={f.eur(a.purchasePrice)} />
                  <Stat label="Décote" value={pct(a.purchasePrice ? value / a.purchasePrice - 1 : 0)} />
                </div>
                {a.depreciation.model !== 'NONE' && <BalanceChart data={curve} today={e.today} hide={f.hide} />}
                <div className="mt-2 text-right"><Button size="sm" onClick={() => setSheet({ k: 'val', id: a.id })}>Saisir une cote</Button></div>
              </Card>
            );
          })}
        </div>
      )}
      {sheet?.k === 'edit' && <PhysicalAssetSheet item={items.find((a) => a.id === sheet.id)} onClose={() => setSheet(null)} />}
      {sheet?.k === 'val' && <DatedValueSheet title="Cote (Argus, estimation…)" label="Valeur (€)" onClose={() => setSheet(null)}
        onSubmit={(date, value) => mutate((d) => { const a = d.physicalAssets.find((x) => x.id === sheet.id)!; a.valuations = upsertDated(a.valuations, { date, value }); })} />}
    </>
  );
}
