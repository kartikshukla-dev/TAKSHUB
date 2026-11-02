// Picks how heavy the 3D stage may be. Pure (env passed in) for testing.
//   off    -> no WebGL canvas, static gradient only
//   low    -> few particles, no bloom, no glass transmission
//   medium -> default
//   high   -> most particles + bloom

export const QUALITY = {
  off: { particles: 0, dpr: 1, bloom: false, transmission: false },
  low: { particles: 3500, dpr: 1, bloom: false, transmission: false },
  medium: { particles: 9000, dpr: 1.5, bloom: false, transmission: true },
  high: { particles: 16000, dpr: 2, bloom: true, transmission: true },
};

export function pickQuality({
  webgl = true,
  reduceEffects = false,
  reducedMotion = false,
  cores = 8,
  memory = 8,
  mobile = false,
  saveData = false,
} = {}) {
  if (!webgl || reduceEffects || reducedMotion) return 'off';
  if (saveData) return 'low';
  if (mobile || cores <= 4 || memory <= 4) return 'low';
  if (cores >= 8 && memory >= 8) return 'high';
  return 'medium';
}

// One step lighter, used when the frame rate drops.
export function stepDown(level) {
  return { high: 'medium', medium: 'low', low: 'low', off: 'off' }[level] || 'low';
}

export function detectWebGL() {
  if (typeof window === 'undefined' || typeof window.WebGLRenderingContext === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function readDeviceEnv() {
  if (typeof navigator === 'undefined') return {};
  return {
    cores: navigator.hardwareConcurrency || 8,
    memory: navigator.deviceMemory || 8,
    mobile: /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || ''),
    saveData: Boolean(navigator.connection && navigator.connection.saveData),
  };
}
