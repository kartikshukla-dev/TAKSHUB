import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('./BackgroundStage', () => ({ default: () => <div data-testid="webgl-stage" /> }));

import StageHost from './StageHost';
import { EffectsProvider } from '../context/EffectsContext';

describe('StageHost', () => {
  it('shows only the static gradient when WebGL is unavailable (jsdom)', async () => {
    render(
      <MemoryRouter>
        <EffectsProvider>
          <StageHost />
        </EffectsProvider>
      </MemoryRouter>
    );
    expect(screen.getByTestId('stage-fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('webgl-stage')).not.toBeInTheDocument();
  });

  it('does not mount the canvas when Reduce effects is on', () => {
    localStorage.setItem('taskhub_reduce_effects', 'on');
    render(
      <MemoryRouter>
        <EffectsProvider>
          <StageHost />
        </EffectsProvider>
      </MemoryRouter>
    );
    expect(screen.queryByTestId('webgl-stage')).not.toBeInTheDocument();
    localStorage.removeItem('taskhub_reduce_effects');
  });
});
