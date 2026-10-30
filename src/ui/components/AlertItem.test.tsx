import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AlertItem } from './ui';

afterEach(cleanup);

describe('AlertItem', () => {
  it('hausse en vert, baisse en rouge', () => {
    const { container } = render(<>
      <AlertItem a={{ id: '1', family: 'MOVES', level: 'warn', tone: 'up', title: 'Vertiv +22,0 % sur 7 jours', detail: '' }} />
      <AlertItem a={{ id: '2', family: 'MOVES', level: 'warn', tone: 'down', title: 'Figma -11,2 % sur 7 jours', detail: '' }} />
    </>);
    expect(screen.getByText('+22,0 %').className).toContain('text-up');
    expect(screen.getByText('-11,2 %').className).toContain('text-down');
    const [up, down] = container.querySelectorAll('div.border-l-4');
    expect(up.className).toContain('border-up');
    expect(down.className).toContain('border-down');
  });
  it('autres alertes : couleur de gravité', () => {
    const { container } = render(<AlertItem a={{ id: '3', family: 'CEILING', level: 'critical', title: 'Livret A plein', detail: '' }} />);
    expect(container.querySelector('div.border-l-4')!.className).toContain('border-down');
  });
});
