// Pure "aging" calculation for task cards: maps elapsed days since a task
// was created into a discrete visual stage. Only meaningful for tasks that
// are not yet "done" (callers should skip calling this for done tasks).

function getAgingDaysRaw(createdAt, now) {
  const ms = now.getTime() - new Date(createdAt).getTime();
  return Math.floor(ms / 86400000);
}

export function getAgingStage(createdAt, now = new Date()) {
  const days = getAgingDaysRaw(createdAt, now);
  if (Number.isNaN(days)) return 'fresh';
  if (days <= 0) return 'fresh';
  if (days <= 2) return 'slight';
  if (days <= 5) return 'amber';
  if (days <= 10) return 'deep-amber';
  return 'red';
}

export function getAgingDays(createdAt, now = new Date()) {
  const days = getAgingDaysRaw(createdAt, now);
  return Number.isNaN(days) ? 0 : Math.max(0, days);
}
