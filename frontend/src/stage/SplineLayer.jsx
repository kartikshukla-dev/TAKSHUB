import { useEffect, useRef, useState } from 'react';

// Loads a Spline scene (VITE_SPLINE_RIBBON_URL) with the Spline runtime
// directly (the React wrapper needs Next.js). Calls onError so the coded
// ribbon can take over if the scene fails to load.
export default function SplineLayer({ url, variant, onError }) {
  const canvasRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let app;
    let cancelled = false;
    import('@splinetool/runtime')
      .then(({ Application }) => {
        if (cancelled || !canvasRef.current) return null;
        app = new Application(canvasRef.current);
        return app.load(url);
      })
      .then(() => !cancelled && setReady(true))
      .catch((err) => {
        console.warn('[stage] Spline scene failed, using coded ribbon:', err?.message || err);
        if (!cancelled) onError?.();
      });
    return () => {
      cancelled = true;
      app?.dispose?.();
    };
  }, [url, onError]);

  return (
    <canvas
      ref={canvasRef}
      className={`spline-layer spline-${variant} ${ready ? 'spline-ready' : ''}`}
      aria-hidden="true"
    />
  );
}
