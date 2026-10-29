import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useApp } from '../store/app';
import { useUi } from '../store/ui';
import { dateTimeFr } from '../lib/format';
import { Button } from './ui';
import { Sheet } from './Sheet';
import { CarIcon, ChartIcon, DebtIcon, EyeIcon, EyeOffIcon, GearIcon, HomeIcon, HouseIcon, ListIcon, LockIcon, MoonIcon, MoreIcon, PiggyIcon, RepeatIcon, SaveIcon, SunIcon } from './icons';

export const NAV = [
  { to: '/', label: 'Accueil', icon: HomeIcon },
  { to: '/investissements', label: 'Investissements', icon: ChartIcon },
  { to: '/epargne', label: 'Épargne', icon: PiggyIcon },
  { to: '/immobilier', label: 'Immobilier', icon: HouseIcon },
  { to: '/biens', label: 'Véhicules & biens', icon: CarIcon },
  { to: '/dettes', label: 'Dettes', icon: DebtIcon },
  { to: '/dca', label: 'DCA', icon: RepeatIcon },
  { to: '/transactions', label: 'Transactions', icon: ListIcon },
  { to: '/reglages', label: 'Réglages', icon: GearIcon },
];
const MOBILE = [NAV[0], { ...NAV[1], label: 'Investir' }, NAV[6], NAV[7], { to: '/plus', label: 'Plus', icon: MoreIcon }];

function Actions({ compact = false }: { compact?: boolean }) {
  const { dirty, saving, hide, setHide, save, lock } = useApp();
  const theme = useUi((s) => s.theme);
  const setTheme = useUi((s) => s.setTheme);
  return (
    <div className={`flex items-center gap-1 ${compact ? '' : 'flex-wrap'}`}>
      {(dirty > 0 || saving) && (
        <Button variant="primary" size="sm" onClick={() => save()} disabled={saving} aria-label="Enregistrer sur GitHub">
          <SaveIcon width={16} height={16} />{saving ? '…' : dirty}
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => setHide(!hide)} aria-label={hide ? 'Afficher les montants' : 'Masquer les montants'}>{hide ? <EyeOffIcon /> : <EyeIcon />}</Button>
      <Button variant="ghost" size="sm" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} aria-label="Changer de thème">{theme === 'dark' ? <SunIcon /> : <MoonIcon />}</Button>
      <Button variant="ghost" size="sm" onClick={() => lock()} aria-label="Verrouiller"><LockIcon /></Button>
    </div>
  );
}

function ConflictSheet() {
  const conflict = useApp((s) => s.conflict);
  const resolve = useApp((s) => s.resolveConflict);
  if (!conflict) return null;
  return (
    <Sheet open onClose={() => useApp.setState({ conflict: undefined })} title={conflict.unreadable ? 'Remplacer le patrimoine existant ?' : 'Conflit d\'enregistrement'}>
      {conflict.unreadable ? (
        <p className="mb-4 text-sm text-mute">Le patrimoine enregistré sur GitHub est chiffré avec <b>une autre passphrase</b> : il ne peut pas être lu avec la tienne. L'écraser le remplace par ta version (l'ancien reste dans l'historique Git, mais il faudra son ancienne passphrase pour l'ouvrir).</p>
      ) : (
        <p className="mb-4 text-sm text-mute">Le patrimoine a été modifié sur GitHub (autre appareil) depuis ton dernier chargement.</p>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="danger" onClick={() => resolve('overwrite')}>Écraser avec ma version</Button>
        {conflict.remote && <Button onClick={() => resolve('reload')}>Recharger la version GitHub (perdre mes modifs)</Button>}
        {conflict.unreadable && <Button onClick={() => useApp.setState({ conflict: undefined })}>Annuler</Button>}
      </div>
    </Sheet>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const updatedAt = useApp((s) => s.prices.updatedAt);
  const link = ({ isActive }: { isActive: boolean }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${isActive ? 'bg-accent/15 text-accent' : 'text-mute hover:bg-surface2 hover:text-ink'}`;
  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-line bg-surface p-4 md:flex">
        <div className="mb-6 flex items-center gap-2 px-2 text-lg font-bold"><img src="icon.svg" alt="" className="h-7 w-7" />Patrimoine</div>
        <nav className="flex flex-1 flex-col gap-1">{NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.to === '/'} className={link}><n.icon />{n.label}</NavLink>)}</nav>
        <div className="mb-2 px-2 text-xs text-mute">Cours : {dateTimeFr(updatedAt || undefined)}</div>
        <Actions />
      </aside>
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-bg/90 px-4 pb-2 pt-[calc(0.5rem+env(safe-area-inset-top))] backdrop-blur md:hidden">
          <div className="flex items-center gap-2 font-bold"><img src="icon.svg" alt="" className="h-6 w-6" />Patrimoine</div>
          <Actions compact />
        </header>
        <main className="mx-auto max-w-6xl px-4 pb-28 pt-4 md:px-8 md:pb-10 md:pt-8">{children}</main>
      </div>
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
        {MOBILE.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => `flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-accent' : 'text-mute'}`}>
            <n.icon />{n.label}
          </NavLink>
        ))}
      </nav>
      <ConflictSheet />
    </div>
  );
}
