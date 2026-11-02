import { Suspense, lazy, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEffects } from '../context/EffectsContext';
import Icon from './Icon';

const PlanetsView = lazy(() => import('../stage/PlanetsView'));

// "Galaxy" (3D planets) vs "Grid" (the regular cards), remembered per page.
// Galaxy needs WebGL and is skipped when effects are reduced.
export function useGalaxyMode(key) {
  const { webgl, motionOff } = useEffects();
  const available = webgl && !motionOff;
  const [mode, setMode] = useState(() => {
    try {
      return localStorage.getItem(`taskhub_view_${key}`) || 'galaxy';
    } catch {
      return 'galaxy';
    }
  });
  const change = (m) => {
    setMode(m);
    try {
      localStorage.setItem(`taskhub_view_${key}`, m);
    } catch {
      /* ignore */
    }
  };
  return { mode: available ? mode : 'grid', setMode: change, available };
}

export function GalaxyToggle({ mode, setMode, available }) {
  if (!available) return null;
  return (
    <div className="segmented">
      <button type="button" className={mode === 'galaxy' ? 'active' : ''} onClick={() => setMode('galaxy')}>
        <Icon name="activity" size={14} /> Galaxy
      </button>
      <button type="button" className={mode === 'grid' ? 'active' : ''} onClick={() => setMode('grid')}>
        <Icon name="dashboard" size={14} /> Grid
      </button>
    </div>
  );
}

export function Galaxy({ items }) {
  const navigate = useNavigate();
  return (
    <Suspense fallback={<div className="planets-view planets-loading">Loading galaxy…</div>}>
      <PlanetsView items={items} onOpen={(href) => href && navigate(href)} />
    </Suspense>
  );
}
