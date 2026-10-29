import { useEffect, useMemo, useState } from 'react';
import { todayParis } from '../../core/dates';
import { buildEngine } from '../../core/engine';
import { applyKraken, COINGECKO_IDS, defaultKrakenAccount, isKrakenBalances, parseKrakenBalances, type KrakenBalance } from '../../core/importers/kraken';
import { applyTradeRepublic, defaultTrMapping, parseTradeRepublic, TR_ACCOUNT_LABELS, type TrMapping, type TrParsed } from '../../core/importers/traderepublic';
import { INVESTMENT_ACCOUNT_TYPES } from '../../core/types';
import { fetchCoingeckoQuotes } from '../../../scripts/lib/coingecko';
import { Sheet } from '../components/Sheet';
import { Badge, Button, Row, SectionTitle } from '../components/ui';
import { useFmt, useToday } from '../hooks';
import { dateFr, qty } from '../lib/format';
import { searchCoingecko } from '../services/live';
import { useApp } from '../store/app';
import { toast } from '../store/ui';

type Loaded = { kind: 'tr'; parsed: TrParsed } | { kind: 'kraken'; balances: KrakenBalance[]; date: string };

/** Import d'un export Trade Republic (transactions) ou Kraken (soldes). Tout se passe dans le navigateur. */
export function ImportSheet({ onClose }: { onClose: () => void }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);

  async function read(file?: File) {
    if (!file) return;
    setError('');
    try {
      const text = await file.text();
      if (isKrakenBalances(text)) {
        const date = file.name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? todayParis();
        setLoaded({ kind: 'kraken', balances: parseKrakenBalances(text), date });
      } else setLoaded({ kind: 'tr', parsed: parseTradeRepublic(text) });
    } catch (e) {
      setLoaded(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <Sheet open onClose={onClose} title={loaded?.kind === 'kraken' ? 'Importer Kraken' : loaded?.kind === 'tr' ? 'Importer Trade Republic' : 'Importer un export'} wide>
      {!loaded && (
        <>
          <label
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); void read(e.dataTransfer.files[0]); }}
            className={`flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition ${drag ? 'border-accent bg-accent/10' : 'border-line hover:border-accent'}`}>
            <span className="text-3xl">📄</span>
            <span className="font-medium">Dépose ton export CSV ici</span>
            <span className="text-sm text-mute">Trade Republic (transactions) ou Kraken (soldes) — ou clique pour choisir</span>
            <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
          </label>
          <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-mute">
            <li><b>Trade Republic</b> : Profil → Paramètres → Activité → Exporter les transactions. Réimporter n'ajoute que les opérations manquantes.</li>
            <li><b>Kraken</b> : Documents → Export → Balances (CSV). Chaque import aligne le compte Kraken sur les soldes du fichier.</li>
            <li>Le fichier est lu dans ton navigateur et n'est envoyé nulle part.</li>
          </ul>
        </>
      )}
      {loaded?.kind === 'tr' && <TradeRepublicPreview parsed={loaded.parsed} onDone={onClose} onBack={() => setLoaded(null)} />}
      {loaded?.kind === 'kraken' && <KrakenPreview balances={loaded.balances} date={loaded.date} onDone={onClose} onBack={() => setLoaded(null)} />}
      {error && <div role="alert" className="mt-3 rounded-xl bg-down/10 px-3 py-2 text-sm text-down">{error}</div>}
    </Sheet>
  );
}

function TradeRepublicPreview({ parsed, onDone, onBack }: { parsed: TrParsed; onDone: () => void; onBack: () => void }) {
  const vault = useApp((s) => s.vault)!;
  const prices = useApp((s) => s.prices);
  const today = useToday();
  const f = useFmt();
  const [mapping, setMapping] = useState<TrMapping>(() => defaultTrMapping(vault));

  const preview = useMemo(() => {
    const r = applyTradeRepublic(vault, parsed, mapping);
    const names = new Map(r.vault.accounts.map((a) => [a.id, a.name]));
    const touched = new Set(r.vault.transactions.filter((t) => t.id.startsWith('tr:')).map((t) => t.accountId));
    const positions = buildEngine(r.vault, prices, today).current.positions.filter((p) => touched.has(p.accountId));
    return { r, names, positions };
  }, [parsed, mapping, vault, prices, today]);
  const candidates = (type: 'PEA' | 'CTO') => vault.accounts.filter((a) => INVESTMENT_ACCOUNT_TYPES.has(a.type) && (a.type === type || a.type === 'AUTRE'));

  return (
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
      <Actions disabled={!preview.r.added && !preview.r.updated} onBack={onBack}
        onImport={() => { useApp.getState().replaceVault(preview.r.vault); toast('ok', `${preview.r.added} opération(s) importée(s) — pense à enregistrer 💾`); onDone(); }} />
    </>
  );
}

function KrakenPreview({ balances, date, onDone, onBack }: { balances: KrakenBalance[]; date: string; onDone: () => void; onBack: () => void }) {
  const vault = useApp((s) => s.vault)!;
  const prices = useApp((s) => s.prices);
  const f = useFmt();
  const [accountId, setAccountId] = useState(() => defaultKrakenAccount(vault));
  const [ids, setIds] = useState<Record<string, string> | null>(null);
  const [eur, setEur] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('Recherche des cours en euros…');

  useEffect(() => {
    let alive = true;
    (async () => {
      const resolved: Record<string, string> = {};
      for (const b of balances.filter((x) => !x.fiat)) {
        const known = COINGECKO_IDS[b.symbol] ?? vault.instruments.find((i) => i.coingeckoId && i.name.toUpperCase() === b.symbol)?.coingeckoId;
        if (known) { resolved[b.symbol] = known; continue; }
        try { const hit = (await searchCoingecko(b.symbol)).find((c) => c.symbol.toUpperCase() === b.symbol); if (hit) resolved[b.symbol] = hit.id; } catch { /* actif ignoré */ }
      }
      // Cours en EUR : CoinGecko, sinon prix USD du fichier converti au taux BCE connu.
      const out: Record<string, number> = {};
      try {
        const q = await fetchCoingeckoQuotes((url) => fetch(url), [...new Set(Object.values(resolved))]);
        for (const [sym, id] of Object.entries(resolved)) if (q[`cg:${id}`]) out[sym] = q[`cg:${id}`].price;
      } catch { /* repli ci-dessous */ }
      const usd = prices.fx.USD;
      for (const b of balances) if (!out[b.symbol] && usd && b.priceUsd) out[b.symbol] = b.priceUsd * usd;
      if (!alive) return;
      setIds(resolved); setEur(out);
      setStatus(Object.keys(out).length ? '' : 'Cours en euros indisponibles (hors ligne ?) : réessaie plus tard.');
    })();
    return () => { alive = false; };
  }, [balances, prices, vault.instruments]);

  const result = useMemo(() => (ids ? applyKraken(vault, balances, { accountId, date, prices, eurPrices: eur, coingeckoIds: ids }) : null), [ids, eur, accountId, vault, balances, date, prices]);
  const accounts = vault.accounts.filter((a) => a.type === 'CRYPTO' || a.type === 'AUTRE');

  return (
    <>
      <div className="mb-4 text-sm text-mute">Soldes au {dateFr(date)} · {balances.length} actifs</div>
      <label className="flex items-center gap-3">
        <span className="w-24 shrink-0 text-sm">Compte</span>
        <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
          <option value="new">Créer « Kraken »</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      {status && <p className="mt-3 text-sm text-mute">{status}</p>}
      {result && (
        <>
          <SectionTitle>Ajustements ({result.lines.filter((l) => l.status === 'ok').length})</SectionTitle>
          <div className="max-h-80 overflow-y-auto">
            {result.lines.map((l) => (
              <Row key={l.symbol} left={<>{l.name} {l.status === 'skipped' ? <Badge tone="warn">{l.reason}</Badge> : l.status === 'unchanged' ? <Badge>à jour</Badge> : null}</>}
                sub={`${l.symbol} · ${qty(l.current)} → ${qty(l.target)}`}
                right={l.status === 'ok' ? <span className={l.delta > 0 ? 'text-up' : 'text-down'}>{l.delta > 0 ? '+' : '−'}{qty(Math.abs(l.delta))}</span> : '—'}
                subRight={l.priceEur && l.status === 'ok' ? <span className="text-mute">{f.eur(Math.abs(l.delta) * l.priceEur)}</span> : undefined} />
            ))}
          </div>
          <p className="mt-3 text-xs text-mute">Kraken ne fournit que des soldes : chaque écart devient un achat (ou une vente) au cours du jour, compensé par un apport (ou un retrait). Le prix de revient d'un ajustement est donc le cours du jour — modifiable ensuite dans Transactions.</p>
          <Actions disabled={!result.added} onBack={onBack}
            onImport={() => { useApp.getState().replaceVault(result.vault); toast('ok', 'Soldes Kraken importés — pense à enregistrer 💾'); onDone(); }} />
        </>
      )}
    </>
  );
}

function Actions({ disabled, onImport, onBack }: { disabled: boolean; onImport: () => void; onBack: () => void }) {
  return (
    <div className="mt-4 flex gap-2">
      <Button variant="primary" className="flex-1" onClick={onImport} disabled={disabled}>Importer</Button>
      <Button onClick={onBack}>Autre fichier</Button>
    </div>
  );
}
