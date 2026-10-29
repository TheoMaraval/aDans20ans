import { useState } from 'react';
import { encryptJson } from '../../core/crypto';
import { parseVault } from '../../core/schema';
import { ASSET_CLASSES, ASSET_CLASS_LABELS, type AssetClass } from '../../core/types';
import { EntityForm, type FieldDef } from '../components/Form';
import { Button, Card, PageHeader, Row, SectionTitle } from '../components/ui';
import { PlusIcon } from '../components/icons';
import { passphraseOk, usePassphraseScore } from '../lib/passphrase';
import { checkAccess, repoFromLocation } from '../services/github';
import { PriceAlertSheet } from '../sheets/EntitySheets';
import { ImportSheet } from '../sheets/ImportSheet';
import { useApp } from '../store/app';
import { toast } from '../store/ui';

const download = (name: string, text: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const COND = { PRICE_BELOW: 'cours <', PRICE_ABOVE: 'cours >', GAIN_PCT_ABOVE: 'PV >', LOSS_PCT_BELOW: 'PV <' };

export default function Settings() {
  const { vault, mutate, token, setToken, sk, changePassphrase, replaceVault } = useApp();
  const v = vault!;
  const s = v.settings;
  const [alert, setAlert] = useState<null | { id?: string }>(null);
  const [importing, setImporting] = useState(false);
  const [newPass, setNewPass] = useState('');
  const [newPass2, setNewPass2] = useState('');
  const score = usePassphraseScore(newPass);
  const loc = repoFromLocation(location);

  const display: FieldDef[] = [
    { key: 'hideAmountsByDefault', label: 'Masquer les montants à l\'ouverture', type: 'checkbox' },
    { key: 'autoLockMinutes', label: 'Verrouillage automatique (minutes d\'inactivité)', type: 'number', required: true },
  ];
  const thresholds: FieldDef[] = [
    { key: 'weeklyMovePct', label: 'Variation hebdo signalée à partir de', type: 'percent', required: true },
    { key: 'monthlyMovePct', label: 'Variation mensuelle signalée à partir de', type: 'percent', required: true },
    { key: 'allocationDriftPts', label: 'Écart d\'allocation toléré (points)', type: 'percent', required: true },
    { key: 'concentrationPct', label: 'Poids max d\'une position', type: 'percent', required: true },
    { key: 'ceilingWarnPct', label: 'Alerte plafond à partir de', type: 'percent', required: true },
    { key: 'emergencyFundMin', label: 'Épargne de précaution minimum (€)', type: 'number' },
    { key: 'emergencyFundAccountIds', label: 'Comptes d\'épargne de précaution', type: 'multi', options: v.accounts.map((a) => ({ value: a.id, label: a.name })) },
  ];
  const allocFields: FieldDef[] = ASSET_CLASSES.map((c) => ({ key: c, label: ASSET_CLASS_LABELS[c], type: 'percent' }));
  const github: FieldDef[] = [
    { key: 'owner', label: 'Propriétaire du dépôt', type: 'text', placeholder: loc?.owner ?? 'mon-pseudo' },
    { key: 'repo', label: 'Nom du dépôt', type: 'text', placeholder: loc?.repo ?? 'finaryPerso' },
    { key: 'branch', label: 'Branche', type: 'text', required: true },
    { key: 'token', label: 'Token GitHub (fine-grained)', type: 'password', hint: 'GitHub → Settings → Developer settings → Fine-grained tokens → Only select repositories : ce dépôt → Repository permissions : Contents = Read and write. Stocké chiffré sur cet appareil uniquement.' },
  ];

  return (
    <>
      <PageHeader title="Réglages" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 font-semibold">GitHub (enregistrement)</h2>
          <EntityForm fields={github} initial={{ ...s.github, token: token ?? '' }} submitLabel="Enregistrer la connexion"
            onSubmit={async (x) => {
              mutate((d) => { d.settings.github = { owner: String(x.owner ?? ''), repo: String(x.repo ?? ''), branch: String(x.branch) }; });
              await setToken(x.token ? String(x.token) : undefined);
              const ref = useApp.getState().repo();
              if (x.token && ref) {
                try { const ok = await checkAccess(ref, String(x.token)); toast(ok ? 'ok' : 'err', ok ? 'Accès en écriture confirmé ✔' : 'Token sans droit d\'écriture sur ce dépôt'); }
                catch (e) { toast('err', e instanceof Error ? e.message : String(e)); }
              }
            }} />
        </Card>

        <Card>
          <h2 className="mb-1 font-semibold">Allocation cible</h2>
          <p className="mb-3 text-sm text-mute">La somme doit faire 100 % (ou tout laisser vide).</p>
          <EntityForm fields={allocFields} initial={s.targetAllocation}
            onSubmit={(x) => {
              const t = Object.fromEntries(Object.entries(x).filter(([, val]) => typeof val === 'number' && val > 0)) as Partial<Record<AssetClass, number>>;
              const sum = Object.values(t).reduce((a, b) => a + (b ?? 0), 0);
              if (Object.keys(t).length && Math.abs(sum - 1) > 0.001) throw new Error(`Total = ${(sum * 100).toFixed(1)} % (attendu 100 %)`);
              mutate((d) => { d.settings.targetAllocation = t; });
              toast('ok', 'Allocation cible mise à jour');
            }} />
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Seuils d'alerte</h2>
          <EntityForm fields={thresholds} initial={{ ...s.alertThresholds, emergencyFundAccountIds: s.emergencyFundAccountIds }}
            onSubmit={(x) => {
              const { emergencyFundAccountIds, ...th } = x as Record<string, never>;
              mutate((d) => { d.settings.alertThresholds = { ...d.settings.alertThresholds, ...th }; d.settings.emergencyFundAccountIds = emergencyFundAccountIds; });
              toast('ok', 'Seuils mis à jour');
            }} />
        </Card>

        <div>
          <Card>
            <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Alertes de prix</h2><Button size="sm" onClick={() => setAlert({})}><PlusIcon width={16} />Ajouter</Button></div>
            {!v.priceAlerts.length && <div className="text-sm text-mute">Aucune alerte.</div>}
            {v.priceAlerts.map((a) => {
              const pctCond = !a.condition.startsWith('PRICE');
              return <Row key={a.id} onClick={() => setAlert({ id: a.id })} left={v.instruments.find((i) => i.id === a.instrumentId)?.name}
                sub={a.note} right={`${COND[a.condition]} ${pctCond ? `${(a.threshold * 100).toFixed(0)} %` : a.threshold}`} subRight={a.active ? 'active' : 'inactive'} />;
            })}
          </Card>
          <Card className="mt-4">
            <h2 className="mb-3 font-semibold">Affichage & sécurité</h2>
            <EntityForm fields={display} initial={s} onSubmit={(x) => { mutate((d) => { Object.assign(d.settings, x); }); toast('ok', 'Préférences mises à jour'); }} />
          </Card>
        </div>

        <Card>
          <h2 className="mb-1 font-semibold">Changer la passphrase</h2>
          <p className="mb-3 text-sm text-mute">Rechiffre et commite les données. Mets ensuite à jour le secret GitHub <code>VAULT_PASSPHRASE</code>, sinon les cours et le mail s'arrêtent.</p>
          <div className="space-y-2">
            <input type="password" autoComplete="new-password" placeholder="Nouvelle passphrase" value={newPass} onChange={(e) => setNewPass(e.target.value)} aria-label="Nouvelle passphrase" />
            <input type="password" autoComplete="new-password" placeholder="Confirmer" value={newPass2} onChange={(e) => setNewPass2(e.target.value)} aria-label="Confirmer la nouvelle passphrase" />
            <Button variant="primary" disabled={!passphraseOk(newPass, score) || newPass !== newPass2} onClick={async () => {
              try { await changePassphrase(newPass); setNewPass(''); setNewPass2(''); toast('ok', 'Passphrase changée ✔ Pense au secret VAULT_PASSPHRASE.'); }
              catch (e) { toast('err', e instanceof Error ? e.message : String(e)); }
            }}>Changer</Button>
            {newPass && !passphraseOk(newPass, score) && <div className="text-xs text-warn">16 caractères minimum et passphrase robuste requis.</div>}
          </div>
        </Card>

        <Card>
          <h2 className="mb-3 font-semibold">Données</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" onClick={() => setImporting(true)}>Importer Trade Republic (CSV)</Button>
            <Button onClick={async () => download('vault.enc', JSON.stringify(await encryptJson(sk!, v)))}>Exporter (chiffré)</Button>
            <Button onClick={() => { if (confirm('Le fichier exporté sera EN CLAIR (non chiffré). Continuer ?')) download(`patrimoine-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(v, null, 2)); }}>Exporter (JSON clair)</Button>
            <label className="inline-flex cursor-pointer items-center rounded-xl bg-surface2 px-4 py-2.5 font-medium hover:bg-line">
              Importer un JSON
              <input type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try { const next = parseVault(JSON.parse(await file.text())); if (confirm('Remplacer toutes les données actuelles ?')) { replaceVault(next); toast('ok', 'Importé — pense à enregistrer'); } }
                catch (x) { toast('err', `Import impossible : ${x instanceof Error ? x.message : x}`); }
                e.target.value = '';
              }} />
            </label>
          </div>
        </Card>
      </div>
      <SectionTitle>À propos</SectionTitle>
      <p className="text-sm text-mute">Données chiffrées AES-256-GCM (PBKDF2 600 000 itérations), déchiffrées uniquement dans ce navigateur. Cours : Yahoo Finance (via GitHub Actions), CoinGecko, BCE.</p>
      {importing && <ImportSheet onClose={() => setImporting(false)} />}
      {alert && <PriceAlertSheet alert={v.priceAlerts.find((a) => a.id === alert.id)} onClose={() => setAlert(null)} />}
    </>
  );
}
