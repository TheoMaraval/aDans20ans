import { useMemo, useState } from 'react';
import { accountPerformance } from '../../core/performance';
import { ACCOUNT_TYPE_LABELS, INVESTMENT_ACCOUNT_TYPES, type PositionView } from '../../core/types';
import { PriceChart } from '../components/charts';
import { Sheet } from '../components/Sheet';
import { Badge, Button, Card, Delta, Empty, PageHeader, Row, SectionTitle, Stat, Tabs } from '../components/ui';
import { EditIcon, PlusIcon } from '../components/icons';
import { useEngine, useFmt } from '../hooks';
import { upsertDated } from '../lib/collections';
import { dateFr, pct, qty } from '../lib/format';
import { AccountSheet, DatedValueSheet, InstrumentSheet, PriceAlertSheet, TransactionSheet } from '../sheets/EntitySheets';
import { ImportSheet } from '../sheets/ImportSheet';
import { PrivateEquitySheet } from '../sheets/PrivateEquitySheet';
import { CostBasisSheet } from '../sheets/CostBasisSheet';
import { adjustableBuys } from '../../core/costBasis';
import { useApp } from '../store/app';

type S = null | { k: 'import' } | { k: 'pe' } | { k: 'account'; id?: string } | { k: 'tx'; preset?: Record<string, unknown> } | { k: 'inst'; id?: string } | { k: 'insts' } | { k: 'pos'; p: PositionView } | { k: 'alert'; instrumentId: string } | { k: 'balance'; accountId: string } | { k: 'manual'; instrumentId: string } | { k: 'pru'; p: PositionView };

export default function Investments() {
  const e = useEngine();
  const f = useFmt();
  const mutate = useApp((s) => s.mutate);
  const v = e.vault;
  const accounts = v.accounts.filter((a) => INVESTMENT_ACCOUNT_TYPES.has(a.type) && !a.archived);
  const [sel, setSel] = useState('all');
  const [sheet, setSheet] = useState<S>(null);
  const close = () => setSheet(null);
  const ids = sel === 'all' ? accounts.map((a) => a.id) : [sel];
  const account = accounts.find((a) => a.id === sel);
  const positions = e.current.positions.filter((p) => ids.includes(p.accountId));
  const value = ids.reduce((s, id) => s + (e.current.byAccount[id] ?? 0), 0);
  const cash = ids.reduce((s, id) => s + (e.current.cashByAccount[id] ?? 0), 0);
  const unreal = positions.reduce((s, p) => s + p.unrealized, 0);
  const cost = positions.reduce((s, p) => s + p.costBasis, 0);
  // Positions soldées comprises (ex. une action entièrement revendue).
  const realized = ids.reduce((s, id) => s + (e.current.realizedByAccount[id] ?? 0), 0);
  // Gain total = valeur − apports nets, comme le « depuis le début » des courtiers.
  const netDeposits = e.transactions.filter((t) => ids.includes(t.accountId) && t.date <= e.today)
    .reduce((s, t) => s + (t.type === 'DEPOSIT' ? t.amount ?? 0 : t.type === 'WITHDRAWAL' ? -(t.amount ?? 0) : 0), 0);
  const gain = value - netDeposits;
  const day = positions.reduce((s, p) => s + (p.changePct1d != null ? p.value - p.value / (1 + p.changePct1d) : 0), 0);
  const perf = useMemo(() => accountPerformance(e.ctx, ids, value, e.today), [e, ids.join(), value]);
  const fondsEuro = account && (account.type === 'ASSURANCE_VIE' || account.type === 'PER');
  const instName = (id: string) => v.instruments.find((i) => i.id === id)?.name ?? '?';

  return (
    <>
      <PageHeader title="Investissements" actions={<>
        <Button size="sm" onClick={() => setSheet({ k: 'import' })}>Importer</Button>
        <Button size="sm" onClick={() => setSheet({ k: 'insts' })}>Actifs</Button>
        <Button size="sm" onClick={() => setSheet({ k: 'pe' })}><PlusIcon width={16} />Non coté</Button>
        <Button size="sm" onClick={() => setSheet({ k: 'account' })}><PlusIcon width={16} />Compte</Button>
        <Button size="sm" variant="primary" onClick={() => setSheet({ k: 'tx', preset: account ? { accountId: account.id } : {} })}><PlusIcon width={16} />Transaction</Button>
      </>} />

      {!accounts.length ? (
        <Empty title="Aucun compte d'investissement" action={<div className="flex flex-wrap justify-center gap-2"><Button variant="primary" onClick={() => setSheet({ k: 'import' })}>Importer Trade Republic / Kraken</Button><Button onClick={() => setSheet({ k: 'account' })}>Créer un compte</Button></div>}>PEA, CTO, assurance-vie, PER, crypto… Tu peux aussi importer tes exports CSV Trade Republic ou Kraken.</Empty>
      ) : (
        <>
          <div className="mb-4"><Tabs options={[{ value: 'all', label: 'Tous' }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} value={sel} onChange={setSel} /></div>
          <Card className="mb-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-mute">{account ? `${ACCOUNT_TYPE_LABELS[account.type]}${account.institution ? ` · ${account.institution}` : ''}` : 'Tous les comptes'}</div>
                <div className="num text-3xl font-bold">{f.eur(value)}</div>
                <Delta value={day}>{f.signed(day)} aujourd'hui</Delta>
              </div>
              {account && <Button size="sm" variant="ghost" onClick={() => setSheet({ k: 'account', id: account.id })} aria-label="Modifier le compte"><EditIcon /></Button>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
              <Stat label="Gain total" value={<Delta value={gain}>{f.signed(gain)}</Delta>} sub={netDeposits > 0 ? <span className="text-mute"><Delta value={gain / netDeposits} /> des versements ({f.eur(netDeposits)})</span> : undefined} />
              <Stat label="Plus-value latente" value={<Delta value={unreal}>{f.signed(unreal)}</Delta>} sub={<Delta value={cost ? unreal / cost : 0} />} />
              <Stat label="Réalisé + dividendes" value={f.signed(realized)} />
              <Stat label="Liquidités" value={f.eur(cash)} sub={cash < -0.01 ? <span className="text-down">Versement manquant ?</span> : undefined} />
              <Stat label={perf && !perf.annualized ? `Performance (${perf.days} j)` : 'Perf. annualisée (TRI)'} value={<Delta value={perf?.rate} />} />
            </div>
            {fondsEuro && (
              <div className="mt-4 flex items-center justify-between rounded-xl bg-surface2 px-3 py-2 text-sm">
                <span>Fonds euros : {f.eur(account.balanceHistory?.at(-1)?.balance ?? 0)}</span>
                <Button size="sm" onClick={() => setSheet({ k: 'balance', accountId: account.id })}>Mettre à jour</Button>
              </div>
            )}
          </Card>

          <SectionTitle>Positions ({positions.length})</SectionTitle>
          {!positions.length ? <Card className="text-sm text-mute">Aucune position. Ajoute une transaction d'achat ou un DCA.</Card> : (
            <>
              <Card className="hidden overflow-x-auto p-0 md:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-mute"><tr className="border-b border-line">
                    {['Actif', 'Qté', 'PRU', 'Cours', 'Valeur', '+/- value', 'Jour', 'Poids'].map((h, i) => <th key={h} className={`px-4 py-3 font-medium ${i ? 'text-right' : ''}`}>{h}</th>)}
                  </tr></thead>
                  <tbody className="whitespace-nowrap">{positions.map((p) => (
                    <tr key={p.accountId + p.instrumentId} onClick={() => setSheet({ k: 'pos', p })} className="cursor-pointer border-b border-line last:border-0 hover:bg-surface2/50">
                      <td className="whitespace-normal px-4 py-3"><div className="font-medium">{p.name}</div>{sel === 'all' && <div className="text-xs text-mute">{accounts.find((a) => a.id === p.accountId)?.name}</div>}</td>
                      <td className="num px-4 text-right">{qty(p.quantity)}</td>
                      <td className="num px-4 text-right">{f.eur(p.pru, true)}</td>
                      <td className="num px-4 text-right">{f.money(p.price, p.currency)}{p.priceSource !== 'live' && p.priceSource !== 'quote' && p.priceSource !== 'close' && <Badge tone="warn">{p.priceSource === 'manual' ? 'manuel' : 'ancien'}</Badge>}</td>
                      <td className="num px-4 text-right font-medium">{f.eur(p.value)}</td>
                      <td className="num px-4 text-right"><Delta value={p.unrealized}>{f.signed(p.unrealized)}</Delta><div className="text-xs"><Delta value={p.unrealizedPct} /></div></td>
                      <td className="px-4 text-right"><Delta value={p.changePct1d} /></td>
                      <td className="num px-4 text-right text-mute">{pct(p.weight, false)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </Card>
              <Card className="py-1 md:hidden">
                {positions.map((p) => <Row key={p.accountId + p.instrumentId} onClick={() => setSheet({ k: 'pos', p })} left={p.name} sub={`${qty(p.quantity)} × ${f.money(p.price, p.currency)}`} right={f.eur(p.value)} subRight={<Delta value={p.unrealizedPct}>{f.signed(p.unrealized)} ({pct(p.unrealizedPct)})</Delta>} />)}
              </Card>
            </>
          )}
        </>
      )}

      {sheet?.k === 'import' && <ImportSheet onClose={close} />}
      {sheet?.k === 'pe' && <PrivateEquitySheet onClose={close} />}
      {sheet?.k === 'account' && <AccountSheet account={v.accounts.find((a) => a.id === sheet.id) ?? { type: 'PEA' }} onClose={close} />}
      {sheet?.k === 'tx' && <TransactionSheet tx={sheet.preset} onClose={close} />}
      {sheet?.k === 'inst' && <InstrumentSheet instrument={v.instruments.find((i) => i.id === sheet.id)} onClose={close} />}
      {sheet?.k === 'alert' && <PriceAlertSheet alert={{ instrumentId: sheet.instrumentId }} onClose={close} />}
      {sheet?.k === 'balance' && <DatedValueSheet title="Solde du fonds euros" label="Solde (€)" onClose={close}
        onSubmit={(date, value) => mutate((d) => { const a = d.accounts.find((x) => x.id === sheet.accountId)!; a.balanceHistory = upsertDated(a.balanceHistory, { date, balance: value }); })} />}
      {sheet?.k === 'manual' && <DatedValueSheet title={`Prix manuel · ${instName(sheet.instrumentId)}`} label="Prix unitaire" onClose={close}
        onSubmit={(date, value) => mutate((d) => { const i = d.instruments.find((x) => x.id === sheet.instrumentId)!; i.manualPrice = upsertDated(i.manualPrice, { date, price: value }); })} />}
      {sheet?.k === 'insts' && (
        <Sheet open onClose={close} title="Actifs">
          <Button variant="primary" className="mb-3 w-full" onClick={() => setSheet({ k: 'inst' })}><PlusIcon width={16} />Nouvel actif</Button>
          {v.instruments.map((i) => <Row key={i.id} onClick={() => setSheet({ k: 'inst', id: i.id })} left={i.name} sub={e.book.key(i) ?? (i.isin ? `${i.isin} · ticker résolu au prochain passage de l'Action « Cours »` : 'prix manuel')} right={<span className="text-mute">{i.currency}</span>} />)}
        </Sheet>
      )}
      {sheet?.k === 'pos' && <PositionSheet p={sheet.p} onClose={close}
        onAction={(a) => setSheet(a === 'tx' ? { k: 'tx', preset: { accountId: sheet.p.accountId, instrumentId: sheet.p.instrumentId } } : a === 'alert' ? { k: 'alert', instrumentId: sheet.p.instrumentId } : a === 'manual' ? { k: 'manual', instrumentId: sheet.p.instrumentId } : a === 'pru' ? { k: 'pru', p: sheet.p } : { k: 'inst', id: sheet.p.instrumentId })} />}
      {sheet?.k === 'pru' && <CostBasisSheet p={sheet.p} onClose={close} />}
    </>
  );
}

function PositionSheet({ p, onClose, onAction }: { p: PositionView; onClose: () => void; onAction: (a: 'tx' | 'alert' | 'inst' | 'manual' | 'pru') => void }) {
  const e = useEngine();
  const f = useFmt();
  const prices = useApp((s) => s.prices);
  const inst = e.vault.instruments.find((i) => i.id === p.instrumentId)!;
  const txs = e.transactions.filter((t) => t.accountId === p.accountId && t.instrumentId === p.instrumentId).sort((a, b) => b.date.localeCompare(a.date));
  const firstDate = txs.at(-1)?.date ?? e.today;
  const key = e.book.key(inst);
  const series = key ? Object.entries(prices.closes[key] ?? {}).filter(([d]) => d >= firstDate).sort().map(([date, value]) => ({ date, value })) : (inst.manualPrice ?? []).map((m) => ({ date: m.date, value: m.price }));
  const buys = txs.filter((t) => t.type === 'BUY').map((t) => ({ date: series.find((s) => s.date >= t.date)?.date ?? t.date, value: t.unitPrice ?? 0 }));
  const TYPE = { BUY: 'Achat', SELL: 'Vente', DIVIDEND: 'Dividende', DEPOSIT: 'Versement', WITHDRAWAL: 'Retrait', FEE: 'Frais', INTEREST: 'Intérêts' };
  return (
    <Sheet open onClose={onClose} title={p.name} wide>
      <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Valeur" value={f.eur(p.value)} />
        <Stat label="+/- value latente" value={<Delta value={p.unrealized}>{f.signed(p.unrealized)}</Delta>} sub={<Delta value={p.unrealizedPct} />} />
        <Stat label="PRU" value={f.eur(p.pru, true)} sub={<span className="text-mute">{qty(p.quantity)} titres</span>} />
        <Stat label="Cours" value={f.money(p.price, p.currency)} sub={<span className="text-mute">{dateFr(p.priceAsOf)}</span>} />
      </div>
      {series.length > 1 && <PriceChart data={series} buys={buys} currency={inst.currency} />}
      <div className="my-4 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" onClick={() => onAction('tx')}><PlusIcon width={16} />Transaction</Button>
        <Button size="sm" onClick={() => onAction('alert')}>Alerte de prix</Button>
        {!key && <Button size="sm" onClick={() => onAction('manual')}>Prix manuel</Button>}
        {adjustableBuys(e.vault, p.accountId, p.instrumentId).length > 0 && <Button size="sm" onClick={() => onAction('pru')}>Corriger le PRU</Button>}
        <Button size="sm" onClick={() => onAction('inst')}>Modifier l'actif</Button>
      </div>
      <SectionTitle>Historique</SectionTitle>
      {txs.map((t) => <Row key={t.id} left={<>{TYPE[t.type]} {t.virtual && <Badge tone="accent">DCA auto</Badge>}</>} sub={dateFr(t.date)}
        right={t.quantity ? `${qty(t.quantity)} × ${f.money(t.unitPrice ?? 0, inst.currency)}` : f.eur(t.amount ?? 0)} subRight={t.fees ? <span className="text-mute">frais {f.eur(t.fees, true)}</span> : undefined} />)}
    </Sheet>
  );
}
