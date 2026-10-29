import { useMemo, useState } from 'react';
import type { Transaction } from '../../core/types';
import { Badge, Button, Card, Empty, PageHeader, Row } from '../components/ui';
import { PlusIcon } from '../components/icons';
import { useEngine, useFmt } from '../hooks';
import { dateFr, monthFr, qty } from '../lib/format';
import { TransactionSheet } from '../sheets/EntitySheets';

const TYPE: Record<Transaction['type'], string> = { BUY: 'Achat', SELL: 'Vente', DIVIDEND: 'Dividende', DEPOSIT: 'Versement', WITHDRAWAL: 'Retrait', FEE: 'Frais', INTEREST: 'Intérêts' };

export default function Transactions() {
  const e = useEngine();
  const f = useFmt();
  const [acc, setAcc] = useState('');
  const [type, setType] = useState('');
  const [q, setQ] = useState('');
  const [auto, setAuto] = useState(true);
  const [limit, setLimit] = useState(100);
  const [sheet, setSheet] = useState<null | Partial<Transaction>>(null);
  const inst = (id?: string) => e.vault.instruments.find((i) => i.id === id);
  const accName = (id: string) => e.vault.accounts.find((a) => a.id === id)?.name ?? '?';

  const list = useMemo(() => e.transactions
    .filter((t) => (!acc || t.accountId === acc) && (!type || t.type === type) && (auto || !t.virtual))
    .filter((t) => !q || `${inst(t.instrumentId)?.name ?? ''} ${t.note ?? ''} ${accName(t.accountId)}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => b.date.localeCompare(a.date)), [e, acc, type, q, auto]);

  const months = new Map<string, Transaction[]>();
  for (const t of list.slice(0, limit)) months.set(t.date.slice(0, 7), [...(months.get(t.date.slice(0, 7)) ?? []), t]);

  return (
    <>
      <PageHeader title="Transactions" subtitle={`${list.length} opérations`} actions={<Button size="sm" variant="primary" onClick={() => setSheet({})}><PlusIcon width={16} />Transaction</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <select value={acc} onChange={(x) => setAcc(x.target.value)} aria-label="Compte"><option value="">Tous les comptes</option>{e.vault.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select value={type} onChange={(x) => setType(x.target.value)} aria-label="Type"><option value="">Tous les types</option>{Object.entries(TYPE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        <input value={q} onChange={(x) => setQ(x.target.value)} placeholder="Rechercher…" aria-label="Rechercher" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={auto} onChange={(x) => setAuto(x.target.checked)} />DCA auto</label>
      </div>
      {!list.length ? <Empty title="Aucune transaction" /> : [...months].map(([m, txs]) => (
        <div key={m} className="mb-4">
          <div className="mb-1 text-xs font-semibold uppercase text-mute">{monthFr(`${m}-01`)}</div>
          <Card className="py-1">{txs.map((t) => {
            const i = inst(t.instrumentId);
            const sign = ['BUY', 'WITHDRAWAL', 'FEE'].includes(t.type) ? -1 : 1;
            const amt = t.quantity ? t.quantity * (t.unitPrice ?? 0) * (t.fxRate ?? 1) : t.amount ?? 0;
            return (
              <Row key={t.id} onClick={() => setSheet(t.virtual ? { ...t, id: undefined, virtual: undefined } : t)}
                left={<>{TYPE[t.type]}{i ? ` · ${i.name}` : ''} {t.virtual && <Badge tone="accent">DCA auto</Badge>}</>}
                sub={`${dateFr(t.date)} · ${accName(t.accountId)}${t.quantity ? ` · ${qty(t.quantity)} × ${f.money(t.unitPrice ?? 0, i?.currency ?? 'EUR')}` : ''}`}
                right={<span className={sign > 0 ? 'text-up' : ''}>{sign > 0 ? '+' : '−'}{f.eur(Math.abs(amt), true)}</span>} />
            );
          })}</Card>
        </div>
      ))}
      {list.length > limit && <Button className="w-full" onClick={() => setLimit(limit + 200)}>Afficher plus</Button>}
      {sheet && <TransactionSheet tx={sheet} onClose={() => setSheet(null)} />}
    </>
  );
}
