import { useEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { useEffects } from '../context/EffectsContext';

// Cinematic page change: the old page sinks back and blurs out, the new one
// rises in. Keyed on the first path segment so in-page query changes
// (filters, ?task=) don't re-trigger it.
export default function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const { motionOff } = useEffects();
  const key = location.pathname.split('/').slice(0, 3).join('/');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);

  if (motionOff) return outlet;

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        className="page-motion"
        initial={{ opacity: 0, y: 30, scale: 0.985, filter: 'blur(10px)' }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, y: -18, scale: 1.01, filter: 'blur(8px)' }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
      >
        {outlet}
      </motion.div>
    </AnimatePresence>
  );
}
