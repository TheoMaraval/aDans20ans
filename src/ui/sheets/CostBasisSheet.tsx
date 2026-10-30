import { useState } from 'react';
import { setPositionCost } from '../../core/costBasis';
import type { PositionView } from '../../core/types';
import { Sheet } from '../components/Sheet';
import { Button, Tabs } from '../components/ui';
import { useEngine, useFmt } from '../hooks';
import { qty } from '../lib/format';
import { useApp } from '../store/app';
import { toast } from '../store/ui';

type Mode = 'pru' | 'total';
type Ccy = 'EUR' | 'USD';

/** Saisie du prix de revient réel d'une position importée depuis les soldes Kraken (ex. « Prix moy. » de l'app Kraken). */
export function CostBasisSheet({ p, onClose }: { p: PositionView; onClose: () => void }) {
  const e = useEngine();
  const f = useFmt();
  const mutate = useApp((s) => s.mutate);
  const [mode, setMode] = useState<Mode>('pru');
  const [ccy, setCcy] = useState<Ccy>('EUR');
  const [raw, setRaw] = useState('');
  const [error, setError] = useState('');
  const usd = e.book.fxAt('USD', e.today);
  const usdKnown = !!e.prices.fx.USD;
  const n = Number(raw.replace(/[\s\u202f\u00a0]/g, '').replace(',', '.'));
  const valid = raw.trim() !== '' && isFinite(n) && n >= 0;
  const target = valid ? (mode === 'pru' ? n * p.quantity : n) * (ccy === 'USD' ? usd : 1) : null;

  function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setError('');
    if (target === null) { setError('Saisis un montant valide.'); return; }
    try {
      mutate((d) => { d.transactions = setPositionCost(d, p.accountId, p.instrumentId, target, e.today).transactions; });
      toast('ok', 'PRU corrigé — pense à enregistrer 💾');
      onClose();
    } catch (x) { setError(x instanceof Error ? x.message : String(x)); }
  }

  return (
    <Sheet open onClose={onClose} title={`Corriger le PRU · ${p.name}`}>
      <p className="mb-3 text-sm text-mute">Recopie le « Prix moy. » (ou le « Coût de base ») affiché par Kraken pour cet actif. Quantité détenue dans l'app : <b className="text-ink">{qty(p.quantity)}</b>.</p>
      <form onSubmit={submit} className="space-y-3">
        <Tabs options={[{ value: 'pru', label: 'Prix moyen' }, { value: 'total', label: 'Coût de base total' }]} value={mode} onChange={setMode} />
        <div className="flex gap-2">
          <input inputMode="decimal" autoFocus value={raw} onChange={(x) => setRaw(x.target.value)} placeholder={mode === 'pru' ? 'ex. 37326,09' : 'ex. 864,41'} aria-label="Montant" />
          <select value={ccy} onChange={(x) => setCcy(x.target.value as Ccy)} className="w-24" aria-label="Devise">
            <option value="EUR">EUR</option>
            <option value="USD" disabled={!usdKnown}>USD</option>
          </select>
        </div>
        {target !== null && (
          <div className="rounded-xl bg-surface2 p-3 text-sm">
            PRU : <b>{f.eur(target / p.quantity, true)}</b> · coût total : <b>{f.eur(target, true)}</b><br />
            Plus-value latente : <b className={p.value - target >= 0 ? 'text-up' : 'text-down'}>{f.signed(p.value - target)}</b>
            {ccy === 'USD' && <span className="text-mute"> (1 $ = {usd.toFixed(4)} €)</span>}
          </div>
        )}
        {error && <div role="alert" className="rounded-xl bg-down/10 px-3 py-2 text-sm text-down">{error}</div>}
        <Button type="submit" variant="primary" className="w-full" disabled={target === null}>Appliquer</Button>
      </form>
    </Sheet>
  );
}
