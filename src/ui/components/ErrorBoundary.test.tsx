import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

afterEach(cleanup);

function Boom(): JSX.Element { throw new Error('Failed to fetch dynamically imported module'); }

describe('ErrorBoundary', () => {
  it('affiche l\'erreur et un bouton Recharger au lieu d\'une page vide', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(screen.getByRole('alert').textContent).toMatch(/Failed to fetch dynamically imported module/);
    expect(screen.getByRole('button', { name: 'Recharger' })).toBeTruthy();
  });
  it('affiche les enfants sans erreur', () => {
    render(<ErrorBoundary><p>ok</p></ErrorBoundary>);
    expect(screen.getByText('ok')).toBeTruthy();
  });
});
