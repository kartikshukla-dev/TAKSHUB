// Pure trigger-condition check for the "drop to done" card animation:
// true only when a task is transitioning INTO "done" from something else
// (not already done, and not a no-op update).
export function shouldPlayDropAnimation(prevStatus, nextStatus) {
  return prevStatus !== 'done' && nextStatus === 'done';
}
