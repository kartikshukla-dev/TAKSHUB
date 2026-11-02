import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { detectWebGL, pickQuality, readDeviceEnv } from '../stage/quality';

const KEY = 'taskhub_reduce_effects';

function readReduce() {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

function mediaReduced() {
  return typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

// Default value lets components render outside the provider (tests).
const DEFAULT = {
  reduceEffects: false,
  reducedMotion: false,
  motionOff: false,
  quality: 'off',
  webgl: false,
  setReduceEffects: () => {},
};

const EffectsContext = createContext(DEFAULT);

export function EffectsProvider({ children }) {
  const [reduceEffects, setReduce] = useState(readReduce);
  const [reducedMotion, setReducedMotion] = useState(mediaReduced);
  const [webgl] = useState(detectWebGL);

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return undefined;
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const motionOff = reduceEffects || reducedMotion;

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-effects', motionOff);
  }, [motionOff]);

  const value = useMemo(
    () => ({
      reduceEffects,
      reducedMotion,
      motionOff,
      webgl,
      quality: pickQuality({ webgl, reduceEffects, reducedMotion, ...readDeviceEnv() }),
      setReduceEffects: (on) => {
        try {
          localStorage.setItem(KEY, on ? 'on' : 'off');
        } catch {
          /* private mode */
        }
        setReduce(on);
      },
    }),
    [reduceEffects, reducedMotion, motionOff, webgl]
  );

  return <EffectsContext.Provider value={value}>{children}</EffectsContext.Provider>;
}

export const useEffects = () => useContext(EffectsContext);
