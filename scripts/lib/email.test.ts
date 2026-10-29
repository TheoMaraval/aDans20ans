import { describe, it, expect } from 'vitest';
import { renderEmail } from './email';
import type { WeeklyReport } from '../../src/core/report';

const report: WeeklyReport = {
  date: '2024-03-31', net: 123456.78, gross: 150000, debts: 26543.22,
  changes: [{ label: 'Semaine', change: 1000, flows: 200, changeExFlows: 800, pct: 0.0065 }, { label: 'Mois', change: -500, flows: 0, changeExFlows: -500, pct: -0.004 }, { label: 'Depuis le 1er janvier', change: 5000, flows: 1000, changeExFlows: 4000, pct: null }],
  weekly: Array.from({ length: 12 }, (_, k) => ({ date: `2024-01-${String(k + 1).padStart(2, '0')}`, net: 100000 + k * 1000 })),
  allocation: [{ cls: 'ACTIONS', actual: 0.6, target: 0.7 }, { cls: 'CASH', actual: 0.4 }],
  top: [{ instrumentId: 'a', name: 'Apple <Inc>', pct: 0.08, value: 1000 }], flop: [],
  alerts: [{ id: 'x', family: 'CEILING', level: 'critical', title: 'Livret A plein', detail: '22 950 €' }],
  dcaThisWeek: [{ planName: 'CW8', date: '2024-03-25', amount: 200 }], dcaNextWeek: [], pending: [],
  pricesUpdatedAt: '2024-03-31T17:00:00Z', priceErrors: 0,
};

describe('email', () => {
  const m = renderEmail(report, 'https://moi.github.io/finaryPerso/');
  it('objet', () => { expect(m.subject).toBe('Patrimoine · semaine du 31/03/2024 · 123 457 € (+0,7 %)'); });
  it('html : sections, échappement, lien', () => {
    expect(m.html).toContain('Positions à surveiller');
    expect(m.html).toContain('Livret A plein');
    expect(m.html).toContain('Apple &lt;Inc&gt;');
    expect(m.html).not.toContain('<Inc>');
    expect(m.html).toContain('https://moi.github.io/finaryPerso/');
    expect(m.html).toContain('cible 70');
  });
  it('texte brut', () => { expect(m.text).toContain('Patrimoine net : 123 457 €'); expect(m.text).toContain('[CRITIQUE] Livret A plein'); });
});
