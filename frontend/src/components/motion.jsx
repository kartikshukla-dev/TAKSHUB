import { useEffect, useRef, useState } from 'react';
import { useEffects } from '../context/EffectsContext';

// Light motion helpers. Everything becomes static when effects are reduced
// (Settings) or the OS asks for reduced motion.

// Page heading with a short CSS fade-up (no per-letter JS animation).
export function RevealText({ as: Tag = 'h1', className, children }) {
  return <Tag className={[className, 'title-in'].filter(Boolean).join(' ')}>{children}</Tag>;
}

// Number that counts up from its previous value when it changes.
export function CountUp({ value, duration = 600 }) {
  const { motionOff } = useEffects();
  const target = Number(value) || 0;
  const [shown, setShown] = useState(motionOff ? target : 0);
  const from = useRef(0);

  useEffect(() => {
    if (motionOff || typeof requestAnimationFrame === 'undefined') {
      setShown(target);
      from.current = target;
      return undefined;
    }
    const start = performance.now();
    const begin = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(begin + (target - begin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, motionOff]);

  return <>{Number.isFinite(Number(value)) ? shown : value}</>;
}

// Motion props for a short staggered entrance; empty when motion is off.
export function staggerItem(i, motionOff) {
  if (motionOff) return {};
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.22, delay: Math.min(i, 8) * 0.05, ease: [0.2, 0.8, 0.2, 1] },
  };
}
