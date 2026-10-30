import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
import { useApp } from './ui/store/app';
import { toast } from './ui/store/ui';
import './index.css';

// Un module chargé à la demande peut avoir disparu après un nouveau déploiement : on recharge une fois.
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('fp.reloadedAt') ?? 0);
    if (Date.now() - last < 30_000) return;
    sessionStorage.setItem('fp.reloadedAt', String(Date.now()));
  } catch { /* stockage indisponible : on recharge quand même */ }
  e.preventDefault();
  location.reload();
});

// Une nouvelle version du site vient de prendre la main (service worker) : l'onglet exécute encore
// l'ancien code. Sur l'écran de déverrouillage on recharge sans rien perdre ; sinon on prévient.
if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (useApp.getState().status !== 'ready') location.reload();
    else toast('info', 'Nouvelle version installée : recharge la page quand tu veux (pense à enregistrer avant).');
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
