// Calendar-day helpers in India time (Asia/Kolkata, UTC+05:30, no DST).
// Task deadlines are stored as UTC midnight of the picked date
// ("2026-11-20" -> 2026-11-20T00:00:00Z), so a deadline's day is its UTC date.

const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 86400000;

// "YYYY-MM-DD" of a moment, in India time.
function istDay(date = new Date()) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// Hour of the day (0-23) in India time.
function istHour(date = new Date()) {
  return new Date(new Date(date).getTime() + IST_OFFSET_MS).getUTCHours();
}

// "YYYY-MM-DD" of a stored deadline.
const deadlineDay = (dueDate) => (dueDate ? new Date(dueDate).toISOString().slice(0, 10) : null);

// Adds whole days to a "YYYY-MM-DD" string.
function addDays(day, n) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

// Deadline value for a "YYYY-MM-DD" day (UTC midnight, same as the date picker).
const dayToDeadline = (day) => new Date(`${day}T00:00:00Z`);

// Whole days from day a to day b ("YYYY-MM-DD").
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / DAY_MS);

// The moment `hour`:`minute` India time happens on a given day.
function istTime(day, hour = 9, minute = 0) {
  return new Date(new Date(`${day}T00:00:00Z`).getTime() + (hour * 60 + minute) * 60000 - IST_OFFSET_MS);
}

// 0 = Sunday ... 6 = Saturday, for a "YYYY-MM-DD" day.
const weekdayOf = (day) => new Date(`${day}T00:00:00Z`).getUTCDay();

module.exports = { istDay, istHour, deadlineDay, addDays, dayToDeadline, daysBetween, istTime, weekdayOf, DAY_MS };
