import { useMemo, useState } from 'react';
import { buildEngine } from '../../core/engine';
import { applyTradeRepublic, defaultTrMapping, parseTradeRepublic, TR_ACCOUNT_LABELS, type TrMapping, type TrParsed } from '../../core/importers/traderepublic';
import { INVESTMENT_ACCOUNT_TYPES } from '../../core/types';
import { Sheet } from '../components/Sheet';
import { Button, Row, SectionTitle } from '../components/ui';
import { useFmt, useToday } from '../hooks';
import { dateFr, qty } from '../lib/format';
import { useApp } from '../store/app';
import { toast } from '../store/ui';

/** Import d'un export « Transactions » Trade Republic (CSV). Tout se passe dans le navigateur. */
export function ImportSheet({ onClose }: { onClose: () => void }) {
  const vault = useApp((s) => s.vault)!;
  const prices = useApp((s) => s.prices);
  const replaceVault = useApp((s) => s.replaceVault);
  const today = useToday();
  const f = useFmt();
  const [parsed, setParsed] = useState<TrParsed | null>(null);
  const [mapping, setMapping] = useState<TrMapping>(() => defaultTrMapping(vault));
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  async function read(file?: File) {
    if (!file) return;
    setError('');
    try { setParsed(parseTradeRepublic(await file.text())); }
    catch (e) { setParsed(null); setError(e instanceof Error ? e.message : String(e)); }
  }

  const preview = useMemo(() => {
    if (!parsed) return null;
    const r = applyTradeRepublic(vault, parsed, mapping);
    const names = new Map(r.vault.accounts.map((a) => [a.id, a.name]));
    const touched = new Set(r.vault.transactions.filter((t) => t.id.startsWith('tr:')).map((t) => t.accountId));
    const positions = buildEngine(r.vault, prices, today).current.positions.filter((p) => touched.has(p.accountId));
    return { r, names, positions };
  }, [parsed, mapping, vault, prices, today]);

  const candidates = (type: 'PEA' | 'CTO') => vault.accounts.filter((a) => INVESTMENT_ACCOUNT_TYPES.has(a.type) && (a.type === type || a.type === 'AUTRE'));

  function confirm() {
    if (!preview) return;
    replaceVault(preview.r.vault);
    toast('ok', `${preview.r.added} opération(s) importée(s) — pense à enregistrer 💾`);
    onClose();
  }

  return (
    <Sheet open onClose={onClose} title="Importer Trade Republic" wide>
      {!parsed ? (
        <>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void read(e.dataTransfer.files[0]); }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${drag ? 'border-accent bg-accent/10' : 'border-line hover:border-accent'}`}>
            <span className="text-3xl">📄</span>
            <span className="font-medium">Dépose ton export CSV ici</span>
            <span className="text-sm text-mute">ou clique pour le choisir</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
          </label>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-mute">
            <li>Dans l'app Trade Republic : Profil → Paramètres → Activité → <b>Exporter les transactions</b> (CSV).</li>
            <li>Dépose le fichier ici. Réimporter un export plus récent n'ajoute que les opérations manquantes.</li>
            <li>Le fichier est lu dans ton navigateur et n'est envoyé nulle part. Les paiements carte sont regroupés par mois.</li>
          </ol>
        </>
      ) : preview && (
        <>
          <div className="mb-4 text-sm text-mute">Export du {dateFr(parsed.from)} au {dateFr(parsed.to)} · {parsed.txs.length} opérations utiles</div>

          <SectionTitle>Comptes</SectionTitle>
          <div className="space-y-2">
            {parsed.accounts.map((k) => (
              <label key={k} className="flex items-center gap-3">
                <span className="w-44 shrink-0 text-sm">{TR_ACCOUNT_LABELS[k]}</span>
                <select value={mapping[k]} onChange={(e) => setMapping({ ...mapping, [k]: e.target.value })}>
                  <option value="new">Créer « {k === 'PEA' ? 'PEA' : 'CTO'} Trade Republic »</option>
                  {candidates(k === 'PEA' ? 'PEA' : 'CTO').map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </label>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-surface2 p-3 text-center text-sm">
            <div><div className="num text-xl font-bold text-up">{preview.r.added}</div>nouvelles</div>
            <div><div className="num text-xl font-bold">{preview.r.updated}</div>mises à jour</div>
            <div><div className="num text-xl font-bold">{preview.r.createdInstruments.length}</div>actifs créés</div>
          </div>
          {preview.r.added === 0 && preview.r.updated === 0 && <p className="mt-2 text-sm text-mute">Tout est déjà à jour.</p>}

          <SectionTitle>Positions après import ({preview.positions.length})</SectionTitle>
          <div className="max-h-72 overflow-y-auto">
            {preview.positions.map((p) => (
              <Row key={p.accountId + p.instrumentId} left={p.name} sub={preview.names.get(p.accountId)} right={qty(p.quantity)} subRight={<span className="text-mute">PRU {f.eur(p.pru, true)}</span>} />
            ))}
          </div>
          <p className="mt-3 text-xs text-mute">Les tickers Yahoo sont retrouvés automatiquement à partir des ISIN au prochain passage de l'Action « Cours » ; en attendant, les positions sont valorisées au dernier prix d'achat.</p>

          <div className="mt-4 flex gap-2">
            <Button variant="primary" className="flex-1" onClick={confirm} disabled={!preview.r.added && !preview.r.updated}>Importer</Button>
            <Button onClick={() => setParsed(null)}>Autre fichier</Button>
          </div>
        </>
      )}
      {error && <div role="alert" className="mt-3 rounded-xl bg-down/10 px-3 py-2 text-sm text-down">{error}</div>}
    </Sheet>
  );
}
