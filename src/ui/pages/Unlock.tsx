import { useState } from 'react';
import { todayParis } from '../../core/dates';
import { emptyVault } from '../../core/defaults';
import { demoVault } from '../../../scripts/lib/demo';
import { Button, Card } from '../components/ui';
import { passphraseOk, usePassphraseScore } from '../lib/passphrase';
import { useApp } from '../store/app';

const LABELS = ['Très faible', 'Faible', 'Moyenne', 'Bonne', 'Excellente'];

export default function Unlock() {
  const status = useApp((s) => s.status);
  const unlock = useApp((s) => s.unlock);
  const createNew = useApp((s) => s.createNew);
  const [pass, setPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [demo, setDemo] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const isNew = status === 'new';
  const score = usePassphraseScore(isNew ? pass : '');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      if (isNew) {
        if (pass !== confirm) throw new Error('Les deux passphrases ne correspondent pas.');
        if (!passphraseOk(pass, score)) throw new Error('Passphrase trop faible : au moins 16 caractères, plusieurs mots non liés.');
        await createNew(pass, demo ? demoVault(todayParis()) : emptyVault());
      } else await unlock(pass);
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <img src="icon.svg" alt="" className="mx-auto mb-3 h-14 w-14" />
        <h1 className="mb-1 text-center text-xl font-bold">{isNew ? 'Créer ton patrimoine' : 'Patrimoine verrouillé'}</h1>
        <p className="mb-5 text-center text-sm text-mute">{isNew ? 'Choisis une passphrase longue : elle chiffre toutes tes données. Elle est irrécupérable si tu l\'oublies.' : 'Déchiffrement local : rien ne quitte ton appareil.'}</p>
        <form onSubmit={submit} className="space-y-3">
          <input type="password" autoFocus autoComplete={isNew ? 'new-password' : 'current-password'} placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} aria-label="Passphrase" />
          {isNew && (
            <>
              <div className="flex items-center gap-2 text-xs">
                <div className="flex flex-1 gap-1">{[0, 1, 2, 3].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${score !== null && score > i ? (score >= 3 ? 'bg-up' : 'bg-warn') : 'bg-surface2'}`} />)}</div>
                <span className="text-mute">{score === null ? '' : LABELS[score]} · {pass.length}/16</span>
              </div>
              <input type="password" autoComplete="new-password" placeholder="Confirmer" value={confirm} onChange={(e) => setConfirm(e.target.value)} aria-label="Confirmer la passphrase" />
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />Commencer avec des données de démo</label>
            </>
          )}
          {err && <div role="alert" className="rounded-xl bg-down/10 px-3 py-2 text-sm text-down">{err}</div>}
          <Button type="submit" variant="primary" className="w-full" disabled={busy || !pass}>{busy ? 'Calcul de la clé…' : isNew ? 'Créer' : 'Déverrouiller'}</Button>
        </form>
      </Card>
    </div>
  );
}
