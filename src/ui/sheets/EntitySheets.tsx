import { useState } from 'react';
import { newId } from '../../core/defaults';
import type { Account, DcaPlan, Instrument, Loan, PhysicalAsset, PriceAlert, RealEstate, Transaction } from '../../core/types';
import { EntityForm } from '../components/Form';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/ui';
import { removeById, upsert, upsertDated } from '../lib/collections';
import { searchCoingecko } from '../services/live';
import { useApp } from '../store/app';
import { toast } from '../store/ui';
import { useToday } from '../hooks';
import { accountFields, datedValueFields, dcaFields, instrumentFields, loanFields, physicalFields, priceAlertFields, realEstateFields, txFields } from './fields';

type Close = () => void;
const useMut = () => useApp((s) => s.mutate);
const useVault = () => useApp((s) => s.vault)!;

export function AccountSheet({ account, onClose }: { account?: Partial<Account>; onClose: Close }) {
  const mutate = useMut();
  const v = useVault();
  const id = account?.id;
  const today = useToday();
  const used = !!id && (v.transactions.some((t) => t.accountId === id) || v.dcaPlans.some((p) => p.accountId === id));
  const lastBalance = account?.balanceHistory?.at(-1)?.balance;
  return (
    <Sheet open onClose={onClose} title={id ? 'Modifier le compte' : 'Nouveau compte'}>
      <EntityForm fields={accountFields} initial={{ currency: 'EUR', type: 'PEA', ...account, balance: lastBalance }}
        onSubmit={(x) => {
          const { balance, ...rest } = x as Record<string, unknown>;
          const next = { ...(account as Account), ...rest, id: id ?? newId() } as Account;
          // Solde saisi à la création (ou modifié) : enregistré à la date du jour.
          if (typeof balance === 'number' && balance !== lastBalance) next.balanceHistory = upsertDated(next.balanceHistory, { date: today, balance });
          mutate((d) => { d.accounts = upsert(d.accounts, next); });
          onClose();
        }}
        onDelete={id ? () => { if (used) { toast('err', 'Compte utilisé par des transactions ou un DCA : archive-le plutôt.'); return; } mutate((d) => { d.accounts = removeById(d.accounts, id); }); onClose(); } : undefined} />
    </Sheet>
  );
}

export function InstrumentSheet({ instrument, onClose }: { instrument?: Partial<Instrument>; onClose: Close }) {
  const mutate = useMut();
  const v = useVault();
  const id = instrument?.id;
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; symbol: string }[]>([]);
  const [prefill, setPrefill] = useState<Partial<Instrument>>({});
  const used = !!id && (v.transactions.some((t) => t.instrumentId === id) || v.dcaPlans.some((p) => p.instrumentId === id));
  const initial = { kind: 'ETF', assetClass: 'ACTIONS', currency: 'EUR', ...instrument, ...prefill };
  return (
    <Sheet open onClose={onClose} title={id ? 'Modifier l\'actif' : 'Nouvel actif'}>
      {!id && (
        <div className="mb-4 rounded-xl bg-surface2 p-3">
          <div className="mb-2 text-sm text-mute">Crypto : rechercher sur CoinGecko</div>
          <div className="flex gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="bitcoin, eth…" />
            <Button type="button" onClick={async () => setFound(await searchCoingecko(q))}>Chercher</Button>
          </div>
          {found.map((c) => (
            <button key={c.id} type="button" className="mt-1 block w-full rounded-lg px-2 py-1.5 text-left text-sm hover:bg-line"
              onClick={() => { setPrefill({ name: c.name, kind: 'CRYPTO', assetClass: 'CRYPTO', currency: 'EUR', coingeckoId: c.id }); setFound([]); }}>
              {c.name} <span className="text-mute">({c.symbol.toUpperCase()} · {c.id})</span>
            </button>
          ))}
        </div>
      )}
      <EntityForm key={JSON.stringify(prefill)} fields={instrumentFields} initial={initial}
        onSubmit={(x) => { mutate((d) => { d.instruments = upsert(d.instruments, { ...(instrument as Instrument), ...x, id: id ?? newId() } as Instrument); }); onClose(); }}
        onDelete={id ? () => { if (used) { toast('err', 'Actif utilisé par des transactions ou un DCA.'); return; } mutate((d) => { d.instruments = removeById(d.instruments, id); d.priceAlerts = d.priceAlerts.filter((a) => a.instrumentId !== id); }); onClose(); } : undefined} />
    </Sheet>
  );
}

export function TransactionSheet({ tx, onClose }: { tx?: Partial<Transaction>; onClose: Close }) {
  const mutate = useMut();
  const v = useVault();
  const today = useToday();
  const id = tx?.id && !tx.virtual ? tx.id : undefined;
  if (!v.accounts.length) return <Sheet open onClose={onClose} title="Transaction"><p className="text-mute">Crée d'abord un compte.</p></Sheet>;
  return (
    <Sheet open onClose={onClose} title={id ? 'Modifier la transaction' : 'Nouvelle transaction'}>
      <EntityForm fields={txFields(v)} initial={{ date: today, type: 'BUY', accountId: v.accounts[0].id, ...tx }}
        onSubmit={(x) => { mutate((d) => { d.transactions = upsert(d.transactions, { ...x, id: id ?? newId(), dcaPlanId: tx?.dcaPlanId, dcaDate: tx?.dcaDate } as Transaction); }); onClose(); }}
        onDelete={id ? () => { mutate((d) => { d.transactions = removeById(d.transactions, id); }); onClose(); } : undefined} />
    </Sheet>
  );
}

export function DcaPlanSheet({ plan, onClose }: { plan?: Partial<DcaPlan>; onClose: Close }) {
  const mutate = useMut();
  const v = useVault();
  const today = useToday();
  const id = plan?.id;
  if (!v.accounts.length || !v.instruments.length) return <Sheet open onClose={onClose} title="Plan DCA"><p className="text-mute">Crée d'abord un compte et un actif.</p></Sheet>;
  return (
    <Sheet open onClose={onClose} title={id ? 'Modifier le DCA' : 'Nouveau DCA'}>
      <EntityForm fields={dcaFields(v)} initial={{ frequency: 'MONTHLY', dayOfMonth: 5, dayOfWeek: '1', startDate: today, fractional: true, expectedAnnualReturn: 0.07, accountId: v.accounts[0].id, instrumentId: v.instruments[0].id, ...plan, ...(plan?.dayOfWeek ? { dayOfWeek: String(plan.dayOfWeek) } : {}) }}
        onSubmit={(x) => {
          const p = { ...x, id: id ?? newId(), dayOfWeek: x.dayOfWeek ? Number(x.dayOfWeek) : undefined } as DcaPlan;
          mutate((d) => { d.dcaPlans = upsert(d.dcaPlans, p); });
          onClose();
        }}
        onDelete={id ? () => { mutate((d) => { d.dcaPlans = removeById(d.dcaPlans, id); d.transactions = d.transactions.filter((t) => t.dcaPlanId !== id); }); onClose(); } : undefined} />
    </Sheet>
  );
}

export function RealEstateSheet({ item, onClose }: { item?: Partial<RealEstate>; onClose: Close }) {
  const mutate = useMut();
  const v = useVault();
  const id = item?.id;
  return (
    <Sheet open onClose={onClose} title={id ? 'Modifier le bien' : 'Nouveau bien immobilier'}>
      <EntityForm fields={realEstateFields(v)} initial={{ kind: 'RESIDENCE_PRINCIPALE', ownershipPct: 1, loanIds: [], ...item }}
        onSubmit={(x) => { mutate((d) => { d.realEstate = upsert(d.realEstate, { ...(item as RealEstate), valuations: item?.valuations ?? [], ...x, id: id ?? newId() } as RealEstate); }); onClose(); }}
        onDelete={id ? () => { mutate((d) => { d.realEstate = removeById(d.realEstate, id); }); onClose(); } : undefined} />
    </Sheet>
  );
}

export function LoanSheet({ loan, onClose }: { loan?: Partial<Loan>; onClose: Close }) {
  const mutate = useMut();
  const id = loan?.id;
  return (
    <Sheet open onClose={onClose} title={id ? 'Modifier le prêt' : 'Nouveau prêt'}>
      <EntityForm fields={loanFields} initial={{ kind: 'IMMOBILIER', ownershipPct: 1, ...loan }}
        onSubmit={(x) => { mutate((d) => { d.loans = upsert(d.loans, { ...(loan as Loan), ...x, id: id ?? newId() } as Loan); }); onClose(); }}
        onDelete={id ? () => { mutate((d) => {
          d.loans = removeById(d.loans, id);
          d.realEstate.forEach((r) => { r.loanIds = r.loanIds.filter((l) => l !== id); });
          d.physicalAssets.forEach((p) => { p.loanIds = p.loanIds.filter((l) => l !== id); });
        }); onClose(); } : undefined} />
    </Sheet>
  );
}

export function PhysicalAssetSheet({ item, onClose }: { item?: Partial<PhysicalAsset>; onClose: Close }) {
  const mutate = useMut();
  const v = useVault();
  const id = item?.id;
  const dep = item?.depreciation;
  const initial = {
    kind: 'VEHICULE', model: dep?.model ?? 'DEGRESSIVE', annualRate: dep?.model === 'DEGRESSIVE' ? dep.annualRate : 0.15,
    years: dep?.model === 'LINEAR' ? dep.years : 5, residualPct: dep?.model === 'LINEAR' ? dep.residualPct : 0.2, loanIds: [], ...item,
  };
  return (
    <Sheet open onClose={onClose} title={id ? 'Modifier le bien' : 'Nouveau bien'}>
      <EntityForm fields={physicalFields(v)} initial={initial}
        onSubmit={(x) => {
          const { model, annualRate, years, residualPct, ...rest } = x as Record<string, never>;
          const depreciation = model === 'DEGRESSIVE' ? { model, annualRate } : model === 'LINEAR' ? { model, years, residualPct } : { model: 'NONE' as const };
          mutate((d) => { d.physicalAssets = upsert(d.physicalAssets, { ...(item as PhysicalAsset), valuations: item?.valuations ?? [], ...rest, depreciation, id: id ?? newId() } as PhysicalAsset); });
          onClose();
        }}
        onDelete={id ? () => { mutate((d) => { d.physicalAssets = removeById(d.physicalAssets, id); }); onClose(); } : undefined} />
    </Sheet>
  );
}

export function PriceAlertSheet({ alert, onClose }: { alert?: Partial<PriceAlert>; onClose: Close }) {
  const mutate = useMut();
  const v = useVault();
  const id = alert?.id;
  if (!v.instruments.length) return <Sheet open onClose={onClose} title="Alerte"><p className="text-mute">Ajoute d'abord un actif.</p></Sheet>;
  const pctCond = alert?.condition && !alert.condition.startsWith('PRICE');
  return (
    <Sheet open onClose={onClose} title={id ? 'Modifier l\'alerte' : 'Nouvelle alerte'}>
      <EntityForm fields={priceAlertFields(v)} initial={{ condition: 'PRICE_BELOW', active: true, instrumentId: v.instruments[0].id, ...alert, ...(pctCond ? { thresholdPct: alert!.threshold, threshold: undefined } : {}) }}
        onSubmit={(x) => {
          const { thresholdPct, ...rest } = x as Record<string, unknown>;
          const threshold = String(rest.condition).startsWith('PRICE') ? rest.threshold : thresholdPct;
          mutate((d) => { d.priceAlerts = upsert(d.priceAlerts, { ...rest, threshold, id: id ?? newId() } as PriceAlert); });
          onClose();
        }}
        onDelete={id ? () => { mutate((d) => { d.priceAlerts = removeById(d.priceAlerts, id); }); onClose(); } : undefined} />
    </Sheet>
  );
}

/** Saisie d'une valeur datée (solde, estimation, cote, CRD, prix manuel). */
export function DatedValueSheet({ title, label, initial, onSubmit, onClose }: { title: string; label: string; initial?: { date?: string; value?: number }; onSubmit: (date: string, value: number) => void; onClose: Close }) {
  const today = useToday();
  return (
    <Sheet open onClose={onClose} title={title}>
      <EntityForm fields={datedValueFields(label)} initial={{ date: today, ...initial }}
        onSubmit={(x) => { onSubmit(String(x.date), Number(x.value)); onClose(); }} />
    </Sheet>
  );
}
