import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './ui/App';
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

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
