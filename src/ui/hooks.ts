import { useEffect, useMemo } from 'react';
import { todayParis } from '../core/dates';
import { buildEngine, type Engine } from '../core/engine';
import { earliestDate, rebuildHistory, toSnapshot } from '../core/history';
import type { Snapshot } from '../core/types';
import { eur, signedEur, money } from './lib/format';
import { fetchLiveQuotes } from './services/live';
import { useApp } from './store/app';

export function useToday(): string {
  return todayParis();
}

export function useEngine(): Engine {
  const vault = useApp((s) => s.vault)!;
  const prices = useApp((s) => s.prices);
  const live = useApp((s) => s.live);
  const today = useToday();
  return useMemo(() => buildEngine(vault, prices, today, live), [vault, prices, live, today]);
}

/** Historique recalculé (indépendant des cours live, sauf le dernier point). */
export function useHistory(): Snapshot[] {
  const vault = useApp((s) => s.vault)!;
  const prices = useApp((s) => s.prices);
  const e = useEngine();
  const base = useMemo(() => {
    const today = todayParis();
    const from = earliestDate(vault);
    if (!from || from >= today) return [];
    return rebuildHistory(buildEngine(vault, prices, today).ctx, from, today);
  }, [vault, prices]);
  return useMemo(() => [...base.filter((s) => s.date < e.today), toSnapshot(e.current)], [base, e]);
}

export function useFmt() {
  const hide = useApp((s) => s.hide);
  return {
    hide,
    eur: (x: number, cents = false) => eur(x, hide, cents),
    signed: (x: number) => signedEur(x, hide),
    money: (x: number, c: string) => money(x, c, hide),
  };
}

export function useAutoLock(): void {
  const minutes = useApp((s) => s.vault?.settings.autoLockMinutes ?? 10);
  useEffect(() => {
    let t = 0, hiddenAt = 0;
    const lockIfClean = () => { const s = useApp.getState(); if (s.status === 'ready' && s.dirty === 0) s.lock(true); };
    const reset = () => { clearTimeout(t); t = window.setTimeout(lockIfClean, minutes * 60_000); };
    const vis = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > 5 * 60_000) lockIfClean();
    };
    const evs = ['pointerdown', 'keydown', 'scroll', 'touchstart'] as const;
    evs.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    document.addEventListener('visibilitychange', vis);
    reset();
    return () => { clearTimeout(t); evs.forEach((ev) => window.removeEventListener(ev, reset)); document.removeEventListener('visibilitychange', vis); };
  }, [minutes]);
}

export function useLivePrices(): void {
  const vault = useApp((s) => s.vault);
  const hasCrypto = !!vault?.instruments.some((i) => i.coingeckoId);
  useEffect(() => {
    if (!hasCrypto) return;
    let alive = true;
    const tick = async () => {
      if (document.hidden) return;
      try { const q = await fetchLiveQuotes(useApp.getState().vault!); if (alive) useApp.getState().setLive(q); } catch { /* garder les derniers cours */ }
    };
    void tick();
    const id = window.setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [hasCrypto]);
}

export function useBeforeUnload(): void {
  const dirty = useApp((s) => s.dirty);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);
}
