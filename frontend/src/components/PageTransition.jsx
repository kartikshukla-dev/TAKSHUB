import { useEffect } from 'react';
import { useLocation, useOutlet } from 'react-router-dom';
import { useEffects } from '../context/EffectsContext';

// Quick page change: the new page fades up 6px in 180ms (pure CSS, no exit
// wait). Keyed on the first path segments so in-page query changes
// (filters, ?task=) don't re-trigger it.
export default function PageTransition() {
  const location = useLocation();
  const outlet = useOutlet();
  const { motionOff } = useEffects();
  const key = location.pathname.split('/').slice(0, 3).join('/');

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [key]);

  return (
    <div key={key} className={motionOff ? undefined : 'page-in'}>
      {outlet}
    </div>
  );
}
