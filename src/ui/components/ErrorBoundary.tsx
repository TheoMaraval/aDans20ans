import { Component, type ReactNode } from 'react';

/** Filet de sécurité : une erreur de rendu affiche un message et un bouton au lieu d'une page vide. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  componentDidCatch(error: Error) { console.error('[Patrimoine] erreur d\'affichage', error); }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="flex min-h-dvh items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 text-center">
          <h1 className="mb-2 text-lg font-bold">Oups, l'affichage a planté</h1>
          <p className="mb-3 text-sm text-mute">Tes données ne sont pas touchées. Recharge la page ; si le problème revient, transmets ce message :</p>
          <pre role="alert" className="mb-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-surface2 p-3 text-left text-xs text-down">{error.message}</pre>
          <button type="button" onClick={() => location.reload()} className="rounded-xl bg-accent px-4 py-2.5 font-medium text-white">Recharger</button>
        </div>
      </div>
    );
  }
}
