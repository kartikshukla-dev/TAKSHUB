import { useEffect, useRef, useState } from 'react';
import { useEffects } from '../context/EffectsContext';

// Cinematic motion helpers. Everything here becomes static when effects
// are reduced (Settings) or the OS asks for reduced motion.

// Heading that reveals character by character (GSAP SplitText). GSAP is
// imported lazily so it stays out of the first-load bundle. Plain strings
// only; anything else renders as-is.
export function RevealText({ as: Tag = 'h1', className, children }) {
  const ref = useRef(null);
  const { motionOff } = useEffects();
  const text = typeof children === 'string' ? children : null;

  useEffect(() => {
    if (motionOff || !text || !ref.current) return undefined;
    let split;
    let tween;
    let cancelled = false;
    Promise.all([import('gsap'), import('gsap/SplitText')])
      .then(([{ gsap }, { SplitText }]) => {
        if (cancelled || !ref.current) return;
        gsap.registerPlugin(SplitText);
        split = new SplitText(ref.current, { type: 'chars,words', charsClass: 'reveal-char' });
        tween = gsap.from(split.chars, {
          yPercent: 110,
          rotateX: -80,
          opacity: 0,
          duration: 0.9,
          ease: 'expo.out',
          stagger: 0.018,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      tween?.kill();
      split?.revert();
    };
  }, [text, motionOff]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}

// Number that counts up from 0 when it mounts or changes.
export function CountUp({ value, duration = 1100 }) {
  const { motionOff } = useEffects();
  const target = Number(value) || 0;
  const [shown, setShown] = useState(motionOff ? target : 0);
  const from = useRef(0);

  useEffect(() => {
    if (motionOff || typeof requestAnimationFrame === 'undefined') {
      setShown(target);
      return undefined;
    }
    const start = performance.now();
    const begin = from.current;
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 4);
      setShown(Math.round(begin + (target - begin) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, motionOff]);

  return <>{Number.isFinite(Number(value)) ? shown : value}</>;
}

// Motion props for a staggered entrance; empty when motion is off.
export function staggerItem(i, motionOff) {
  if (motionOff) return {};
  return {
    initial: { opacity: 0, y: 24, scale: 0.97, filter: 'blur(6px)' },
    animate: { opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' },
    transition: { duration: 0.7, delay: Math.min(i, 12) * 0.05, ease: [0.16, 1, 0.3, 1] },
  };
}
