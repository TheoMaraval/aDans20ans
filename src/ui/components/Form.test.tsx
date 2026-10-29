import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { EntityForm, fromValues, toValues, type FieldDef } from './Form';

const fields: FieldDef[] = [
  { key: 'name', label: 'Nom', type: 'text', required: true },
  { key: 'rate', label: 'Taux', type: 'percent' },
  { key: 'amount', label: 'Montant', type: 'number' },
  { key: 'kind', label: 'Type', type: 'select', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }] },
  { key: 'extra', label: 'Extra', type: 'text', show: (v) => v.kind === 'B' },
];

afterEach(cleanup);

describe('Form', () => {
  it('conversions', () => {
    const v = toValues(fields, { name: 'x', rate: 0.035, amount: 12 });
    expect(v).toMatchObject({ name: 'x', rate: '3.5', amount: '12' });
    expect(fromValues(fields, { ...v, rate: '3,5', amount: '1 200,5', kind: 'A', extra: 'zz' })).toEqual({ name: 'x', rate: 0.035, amount: 1200.5, kind: 'A', extra: undefined });
  });
  it('requis et soumission', () => {
    const onSubmit = vi.fn();
    render(<EntityForm fields={fields} initial={{ kind: 'A' }} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Nom/);
    fireEvent.change(screen.getByLabelText(/^Nom/), { target: { value: 'PEA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'PEA', kind: 'A' }));
  });
  it('affiche l\'erreur levée par onSubmit', () => {
    render(<EntityForm fields={fields} initial={{ name: 'x', kind: 'A' }} onSubmit={() => { throw new Error('compte inconnu'); }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(screen.getByRole('alert').textContent).toMatch(/compte inconnu/);
  });
});
