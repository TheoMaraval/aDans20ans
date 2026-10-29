import { useUi } from '../store/ui';

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const dismiss = useUi((s) => s.dismiss);
  return (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 top-3 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <button key={t.id} onClick={() => dismiss(t.id)}
          className={`pointer-events-auto max-w-md rounded-xl px-4 py-2.5 text-sm shadow-lg ${t.kind === 'err' ? 'bg-down text-white' : t.kind === 'ok' ? 'bg-up text-white' : 'bg-surface2 text-ink'}`}>{t.text}</button>
      ))}
    </div>
  );
}
