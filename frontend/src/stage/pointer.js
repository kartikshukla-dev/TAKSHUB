// Window-level pointer position in -1..1 (the background canvas ignores
// pointer events, so scenes read this instead).
export const pointer = { x: 0, y: 0 };

let bound = false;
export function bindPointer() {
  if (bound || typeof window === 'undefined') return;
  bound = true;
  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
    },
    { passive: true }
  );
}

// Short-lived bursts fired by the UI (e.g. a task dropped into Done).
const listeners = new Set();
export function emitBurst(x, y) {
  listeners.forEach((fn) => fn({ x, y, at: performance.now() }));
}
export function onBurst(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
