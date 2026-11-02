import { useCallback, useRef } from 'react';
import { useEffects } from '../context/EffectsContext';

// Pointer-driven 3D tilt. Writes CSS variables (--rx, --ry, --mx, --my)
// that `.tilt` in index.css turns into a perspective transform + glare.
// Off for touch devices and when effects are reduced.
export default function useTilt(max = 9) {
  const { motionOff } = useEffects();
  const frame = useRef(0);
  const canHover = typeof window !== 'undefined' && window.matchMedia?.('(hover: hover)').matches;
  const enabled = !motionOff && canHover;

  const onPointerMove = useCallback(
    (e) => {
      if (!enabled) return;
      const el = e.currentTarget;
      const { left, top, width, height } = el.getBoundingClientRect();
      const px = (e.clientX - left) / width;
      const py = (e.clientY - top) / height;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        el.style.setProperty('--ry', `${(px - 0.5) * max * 2}deg`);
        el.style.setProperty('--rx', `${(0.5 - py) * max * 2}deg`);
        el.style.setProperty('--mx', `${px * 100}%`);
        el.style.setProperty('--my', `${py * 100}%`);
      });
    },
    [enabled, max]
  );

  const onPointerLeave = useCallback((e) => {
    cancelAnimationFrame(frame.current);
    const el = e.currentTarget;
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
  }, []);

  return enabled ? { onPointerMove, onPointerLeave, 'data-tilt': '' } : {};
}
