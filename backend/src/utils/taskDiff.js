const Task = require('../models/Task');

/**
 * Compares `updates` against the current task field values and returns an
 * array of activityLog entries for anything that actually changed.
 * Only fields listed in Task.TRACKED_FIELDS are considered.
 */
function diffTaskFields(task, updates, changedByUserId) {
  const entries = [];

  for (const field of Task.TRACKED_FIELDS) {
    if (!(field in updates)) continue;

    const oldValue = task[field];
    const newValue = updates[field];

    const oldComparable = Array.isArray(oldValue) ? JSON.stringify(oldValue) : String(oldValue ?? '');
    const newComparable = Array.isArray(newValue) ? JSON.stringify(newValue) : String(newValue ?? '');

    if (oldComparable !== newComparable) {
      entries.push({
        field,
        oldValue: oldValue ?? null,
        newValue: newValue ?? null,
        changedBy: changedByUserId,
        changedAt: new Date(),
      });
    }
  }

  return entries;
}

module.exports = { diffTaskFields };
