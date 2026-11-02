import { Suspense, lazy, useCallback, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useEffects } from '../context/EffectsContext';
import routeToScene from './routeToScene';
import { chooseRibbonSource, SPLINE_RIBBON_URL } from './ribbonSource';

// Heavy 3D code lives in separate lazy chunks.
const BackgroundStage = lazy(() => import('./BackgroundStage'));
const SplineLayer = lazy(() => import('./SplineLayer'));

// Always renders the static gradient; layers the live 3D on top when the
// device allows it and the user hasn't turned effects off.
export default function StageHost() {
  const { quality } = useEffects();
  const { pathname } = useLocation();
  const { scene, shape } = routeToScene(pathname);
  const [splineFailed, setSplineFailed] = useState(false);
  const onSplineError = useCallback(() => setSplineFailed(true), []);
  const source = chooseRibbonSource(SPLINE_RIBBON_URL, splineFailed);
  const live = quality !== 'off';
  const variant = pathname.startsWith('/dashboard') ? 'dashboard' : 'login';

  return (
    <>
      <div className="stage-fallback" data-testid="stage-fallback" aria-hidden="true" />
      {live && (
        <Suspense fallback={null}>
          <BackgroundStage
            quality={quality}
            scene={scene}
            shape={shape}
            pathname={pathname}
            codedRibbon={source === 'coded'}
          />
        </Suspense>
      )}
      {live && scene === 'ribbon' && source === 'spline' && (
        <Suspense fallback={null}>
          <SplineLayer url={SPLINE_RIBBON_URL} variant={variant} onError={onSplineError} />
        </Suspense>
      )}
      <div className="stage-vignette" aria-hidden="true" />
    </>
  );
}
