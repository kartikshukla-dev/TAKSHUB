import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CountUp, staggerItem } from './motion';
import { EffectsProvider } from '../context/EffectsContext';

describe('motion helpers', () => {
  it('stagger props are empty when motion is off', () => {
    expect(staggerItem(2, true)).toEqual({});
    expect(staggerItem(2, false).transition.delay).toBeCloseTo(0.1);
  });

  it('CountUp shows the final value straight away when effects are reduced', () => {
    localStorage.setItem('taskhub_reduce_effects', 'on');
    render(
      <EffectsProvider>
        <CountUp value={42} />
      </EffectsProvider>
    );
    expect(screen.getByText('42')).toBeInTheDocument();
    localStorage.removeItem('taskhub_reduce_effects');
  });

  it('the app shell has no light/dark toggle any more', async () => {
    const src = await import('./AppShell.jsx?raw');
    expect(src.default).not.toMatch(/Toggle dark mode|toggleTheme|useTheme/);
  });
});
