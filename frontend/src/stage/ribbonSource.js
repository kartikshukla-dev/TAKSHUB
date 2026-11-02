// Spline scene if a URL is configured and it hasn't failed, else the
// ribbon drawn in code.
export function chooseRibbonSource(url, failed = false) {
  const clean = (url || '').trim();
  if (!clean || failed) return 'coded';
  return /^https:\/\/.+\.splinecode(\?.*)?$/.test(clean) ? 'spline' : 'coded';
}

export const SPLINE_RIBBON_URL = import.meta.env.VITE_SPLINE_RIBBON_URL || '';
