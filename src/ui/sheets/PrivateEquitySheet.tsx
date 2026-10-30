import { addPrivateInvestment } from '../../core/privateEquity';
import { EntityForm, type FieldDef } from '../components/Form';
import { Sheet } from '../components/Sheet';
import { useToday } from '../hooks';
import { useApp } from '../store/app';
import { toast } from '../store/ui';

/** Participation non cotée (startup, crowdfunding, BSPCE…) : patrimoine bloqué, valorisé manuellement. */
export function PrivateEquitySheet({ onClose }: { onClose: () => void }) {
  const vault = useApp((s) => s.vault)!;
  const replaceVault = useApp((s) => s.replaceVault);
  const today = useToday();
  const accounts = vault.accounts.filter((a) => a.type === 'NON_COTE');
  const fields: FieldDef[] = [
    { key: 'accountId', label: 'Compte', type: 'select', required: true, options: [...accounts.map((a) => ({ value: a.id, label: a.name })), { value: 'new', label: 'Créer « Startups (non coté) »' }] },
    { key: 'name', label: 'Nom de la société / du projet', type: 'text', required: true, placeholder: 'ex. MaStartup SAS' },
    { key: 'date', label: 'Date de l\'investissement', type: 'date', required: true },
    { key: 'amount', label: 'Montant investi (€)', type: 'number', required: true },
    { key: 'currentValue', label: 'Valorisation actuelle de ta part (€)', type: 'number', hint: 'Vide = montant investi. À mettre à jour ensuite via « Prix manuel » dans le détail de la position (dernière levée, rapport annuel…).' },
  ];
  return (
    <Sheet open onClose={onClose} title="Investissement non coté">
      <p className="mb-3 text-sm text-mute">Startups, crowdfunding, BSPCE… Comptés dans ton patrimoine comme <b>non coté (bloqué)</b>, à part dans la répartition.</p>
      <EntityForm fields={fields} initial={{ accountId: accounts[0]?.id ?? 'new', date: today }} submitLabel="Ajouter"
        onSubmit={(x) => {
          replaceVault(addPrivateInvestment(vault, {
            accountId: String(x.accountId), name: String(x.name), date: String(x.date), amount: Number(x.amount),
            currentValue: x.currentValue === undefined ? undefined : Number(x.currentValue), today,
          }));
          toast('ok', `${x.name} ajouté — pense à enregistrer 💾`);
          onClose();
        }} />
    </Sheet>
  );
}
