// In-process bus for "a task changed" so lists refresh after local edits
// even before (or without) the matching socket event.
const bus = new EventTarget();

export function emitTaskChange(task, kind = 'updated') {
  bus.dispatchEvent(new CustomEvent('change', { detail: { task, kind } }));
}

export function onTaskChange(handler) {
  const fn = (e) => handler(e.detail);
  bus.addEventListener('change', fn);
  return () => bus.removeEventListener('change', fn);
}
