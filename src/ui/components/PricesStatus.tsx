import { dateTimeFr } from '../lib/format';
import { useApp } from '../store/app';
import { toast } from '../store/ui';

/** Fraîcheur des cours + bouton qui lance l'Action « Cours » sur GitHub. */
export function PricesStatus({ className = '' }: { className?: string }) {
  const updatedAt = useApp((s) => s.prices.updatedAt);
  const refreshing = useApp((s) => s.pricesRefreshing);
  async function refresh() {
    try {
      await useApp.getState().requestPricesRefresh();
    } catch (e) {
      toast('err', e instanceof Error ? e.message : String(e));
    }
  }
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-2 ${className}`}>
      <span>Cours du {dateTimeFr(updatedAt || undefined)}</span>
      <button type="button" onClick={refresh} disabled={refreshing} className="text-accent underline-offset-2 hover:underline disabled:no-underline disabled:opacity-60">
        {refreshing ? 'actualisation…' : 'Actualiser'}
      </button>
    </span>
  );
}
