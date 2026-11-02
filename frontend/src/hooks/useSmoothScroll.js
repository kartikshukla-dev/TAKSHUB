import { useEffect } from 'react';
import { useEffects } from '../context/EffectsContext';

// Lenis smooth scrolling for the page. Modals, popovers, the palette and
// other inner scroll areas opt out with data-lenis-prevent (or are fixed
// overlays, which Lenis ignores).
export default function useSmoothScroll() {
  const { motionOff } = useEffects();

  useEffect(() => {
    if (motionOff || typeof window === 'undefined' || !window.matchMedia?.('(hover: hover)').matches) return undefined;
    let lenis;
    let raf;
    let cancelled = false;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
      const loop = (time) => {
        lenis.raf(time);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, [motionOff]);
}
