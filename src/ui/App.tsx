import { useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { useAutoLock, useAutoPrices, useBeforeUnload, useLivePrices } from './hooks';
import { useApp } from './store/app';
// Pages importées statiquement : un chargement différé après le déverrouillage pouvait viser
// un fichier supprimé par un nouveau déploiement (page vide). Elles sont petites, autant les embarquer.
import Unlock from './pages/Unlock';
import Home from './pages/Home';
import Investments from './pages/Investments';
import Savings from './pages/Savings';
import RealEstatePage from './pages/RealEstate';
import Assets from './pages/Assets';
import Debts from './pages/Debts';
import Dca from './pages/Dca';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import More from './pages/More';

function Ready() {
  useAutoLock();
  useLivePrices();
  useAutoPrices();
  useBeforeUnload();
  return (
    <HashRouter>
      <Layout>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/investissements" element={<Investments />} />
            <Route path="/epargne" element={<Savings />} />
            <Route path="/immobilier" element={<RealEstatePage />} />
            <Route path="/biens" element={<Assets />} />
            <Route path="/dettes" element={<Debts />} />
            <Route path="/dca" element={<Dca />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/reglages" element={<Settings />} />
            <Route path="/plus" element={<More />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
      </Layout>
    </HashRouter>
  );
}

export default function App() {
  const status = useApp((s) => s.status);
  const boot = useApp((s) => s.boot);
  useEffect(() => { void boot(); }, [boot]);
  return (
    <>
      <Toasts />
      <ErrorBoundary>
        {status === 'boot' ? <div className="flex min-h-dvh items-center justify-center text-mute">Chargement…</div>
          : status === 'ready' ? <Ready /> : <Unlock />}
      </ErrorBoundary>
    </>
  );
}
