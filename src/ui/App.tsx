import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Toasts } from './components/Toasts';
import { useAutoLock, useBeforeUnload, useLivePrices } from './hooks';
import { useApp } from './store/app';
import Unlock from './pages/Unlock';

const Home = lazy(() => import('./pages/Home'));
const Investments = lazy(() => import('./pages/Investments'));
const Savings = lazy(() => import('./pages/Savings'));
const RealEstatePage = lazy(() => import('./pages/RealEstate'));
const Assets = lazy(() => import('./pages/Assets'));
const Debts = lazy(() => import('./pages/Debts'));
const Dca = lazy(() => import('./pages/Dca'));
const Transactions = lazy(() => import('./pages/Transactions'));
const Settings = lazy(() => import('./pages/Settings'));
const More = lazy(() => import('./pages/More'));

function Ready() {
  useAutoLock();
  useLivePrices();
  useBeforeUnload();
  return (
    <HashRouter>
      <Layout>
        <Suspense fallback={<div className="animate-pulse text-mute">Chargement…</div>}>
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
        </Suspense>
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
      {status === 'boot' ? <div className="flex min-h-dvh items-center justify-center text-mute">Chargement…</div>
        : status === 'ready' ? <Ready /> : <Unlock />}
    </>
  );
}
