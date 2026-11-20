// Background jobs in the API process: deadline reminders and repeating
// tasks. Runs a minute after start, then every 15 minutes. Jobs are safe to
// run twice (each send / task is claimed with an atomic update first).
const { runReminders } = require('./reminderService');
const { runDueRecurring } = require('./recurringService');

const EVERY_MS = 15 * 60 * 1000;
let timer = null;
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const made = await runDueRecurring();
    if (made) console.log(`[scheduler] created ${made} repeating task(s)`);
    const sent = await runReminders();
    if (sent.dueSoon || sent.overdue) console.log(`[scheduler] reminders: ${sent.dueSoon} due tomorrow, ${sent.overdue} overdue`);
  } catch (err) {
    console.error('[scheduler] failed:', err.message);
  } finally {
    running = false;
  }
}

function startScheduler() {
  if (timer || process.env.NODE_ENV === 'test' || process.env.DISABLE_SCHEDULER === 'true') return;
  setTimeout(tick, 60 * 1000).unref();
  timer = setInterval(tick, EVERY_MS);
  timer.unref();
  console.log('[scheduler] reminders and repeating tasks every 15 min');
}

module.exports = { startScheduler, tick };
