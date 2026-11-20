// Labels for repeating-task schedules ({ freq, weekday, dayOfMonth }).
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ordinal = (n) => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

export function scheduleLabel(s) {
  if (!s) return '';
  switch (s.freq) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Every weekday (Mon–Fri)';
    case 'weekly':
      return `Every ${WEEKDAYS[s.weekday] || 'week'}`;
    case 'monthly':
      return `Every month on the ${ordinal(s.dayOfMonth)}${s.dayOfMonth > 28 ? ' (or the last day)' : ''}`;
    default:
      return '';
  }
}

// "Today" in India time as "YYYY-MM-DD", and its weekday / day of month,
// used to pre-fill the repeat picker.
export function istToday(now = new Date()) {
  const d = new Date(now.getTime() + 330 * 60000);
  return { day: d.toISOString().slice(0, 10), weekday: d.getUTCDay(), dayOfMonth: d.getUTCDate() };
}
