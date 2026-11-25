// Bump RELEASE whenever the What's new list changes: everyone sees the
// modal open by itself once more.
export const RELEASE = '2026-11-not-approved-button';
const SEEN_KEY = 'oncare_whats_new_seen';

export function hasSeenRelease() {
  try {
    return localStorage.getItem(SEEN_KEY) === RELEASE;
  } catch {
    return true; // storage blocked: don't pop up on every page load
  }
}

export function markReleaseSeen() {
  try {
    localStorage.setItem(SEEN_KEY, RELEASE);
  } catch {
    /* storage blocked */
  }
}
