import { create } from 'zustand';

export interface Toast { id: number; kind: 'ok' | 'err' | 'info'; text: string }
type Theme = 'dark' | 'light';

interface UiState {
  theme: Theme; toasts: Toast[];
  setTheme(t: Theme): void;
  toast(kind: Toast['kind'], text: string): void;
  dismiss(id: number): void;
}

const initialTheme = (): Theme => {
  try { return localStorage.getItem('fp.theme') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
};
let seq = 0;

export const useUi = create<UiState>((set, get) => ({
  theme: initialTheme(), toasts: [],
  setTheme(t) {
    try { localStorage.setItem('fp.theme', t); } catch { /* rien */ }
    document.documentElement.classList.toggle('dark', t === 'dark');
    set({ theme: t });
  },
  toast(kind, text) {
    const id = ++seq;
    set({ toasts: [...get().toasts, { id, kind, text }] });
    setTimeout(() => get().dismiss(id), kind === 'err' ? 7000 : 3500);
  },
  dismiss(id) { set({ toasts: get().toasts.filter((t) => t.id !== id) }); },
}));

export const toast = (kind: Toast['kind'], text: string) => useUi.getState().toast(kind, text);
