require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const { createUser } = require('./helpers');
const Department = require('../src/models/Department');
const Notification = require('../src/models/Notification');
const Task = require('../src/models/Task');
const RecurringTask = require('../src/models/RecurringTask');
const PushSubscription = require('../src/models/PushSubscription');
const emailService = require('../src/services/emailService');
const { runReminders } = require('../src/services/reminderService');
const recurring = require('../src/services/recurringService');
const { istDay, addDays, dayToDeadline, istTime } = require('../src/utils/istDate');

let app;
let tech;
let ops;
let head;
let dev1;
let dev2;
let opsMember;
let sendMail;
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const settle = () => new Promise((r) => setTimeout(r, 200));
const base = (t) => `/api/projects/${t.project._id}/tasks/${t._id}`;

beforeAll(async () => {
  delete process.env.VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  await startTestDb();
  app = createApp();
}, 60000);

beforeEach(async () => {
  sendMail = jest.fn().mockResolvedValue(true);
  emailService.setTransporter({ sendMail });
  tech = await Department.create({ name: 'Tech' });
  ops = await Department.create({ name: 'Operations' });
  head = await createUser({ name: 'Parvez Head', role: 'manager', department: tech._id });
  dev1 = await createUser({ name: 'Arjun Dev', department: tech._id });
  dev2 = await createUser({ name: 'Neha Dev', department: tech._id });
  opsMember = await createUser({ name: 'Muskan Ops', department: ops._id });
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

const teamTask = async (extra = {}) =>
  (await request(app).post('/api/tasks').set(auth(dev1)).send({ title: 'Fix estimate PDF', toTeam: String(tech._id), assignee: String(dev2.user._id), ...extra })).body.task;

describe('Not approved needs a reason', () => {
  it('rejects without a reason, stores it with the status and clears it after', async () => {
    const t = await teamTask();
    const none = await request(app).patch(base(t)).set(auth(head)).send({ status: 'not-approved' });
    expect(none.status).toBe(400);
    expect(none.body.message).toMatch(/reason/i);

    const ok = await request(app).patch(base(t)).set(auth(head)).send({ status: 'not-approved', notApprovedReason: 'Footer overlaps the table on page 2' });
    expect(ok.status).toBe(200);
    expect(ok.body.task.notApproved).toMatchObject({ reason: 'Footer overlaps the table on page 2' });
    expect(ok.body.task.notApproved.by.name).toBe('Parvez Head');

    await settle();
    const n = await Notification.findOne({ user: dev2.user._id, type: 'task_not_approved' });
    expect(n.text).toMatch(/Not approved: “Footer overlaps/);

    const back = await request(app).patch(base(t)).set(auth(head)).send({ status: 'in-progress' });
    expect(back.body.task.notApproved).toBeNull();
  });
});

describe('deadline reminders', () => {
  // 10:00 IST on a fixed day.
  const now = istTime('2026-11-20', 10);
  const today = '2026-11-20';

  it('reminds the assignee the day before, once', async () => {
    const t = await teamTask();
    await Task.updateOne({ _id: t._id }, { dueDate: dayToDeadline(addDays(today, 1)) });
    expect((await runReminders(now)).dueSoon).toBe(1);
    expect((await runReminders(now)).dueSoon).toBe(0);
    await settle();
    const n = await Notification.find({ user: dev2.user._id, type: 'task_due_soon' });
    expect(n).toHaveLength(1);
    expect(n[0].text).toMatch(/due tomorrow/);
    expect(sendMail).toHaveBeenCalled();
  });

  it('tells the assignee and the team head when overdue, re-arms on a new deadline, skips old ones and nights', async () => {
    const t = await teamTask();
    await Task.updateOne({ _id: t._id }, { dueDate: dayToDeadline(addDays(today, -1)) });
    expect((await runReminders(istTime(today, 23))).overdue).toBe(0); // night: quiet
    expect((await runReminders(now)).overdue).toBe(1);
    expect((await runReminders(now)).overdue).toBe(0);
    await settle();
    expect(await Notification.countDocuments({ user: dev2.user._id, type: 'task_overdue' })).toBe(1);
    const forHead = await Notification.findOne({ user: head.user._id, type: 'task_overdue' });
    expect(forHead.text).toMatch(/assigned to Neha Dev/);

    // New deadline (also passed) -> one more reminder.
    await Task.updateOne({ _id: t._id }, { dueDate: dayToDeadline(addDays(today, -2)) });
    expect((await runReminders(now)).overdue).toBe(1);

    // Long overdue tasks are not dug up.
    await Task.updateOne({ _id: t._id }, { dueDate: dayToDeadline(addDays(today, -30)) });
    expect((await runReminders(now)).overdue).toBe(0);

    // Done tasks are left alone.
    await Task.updateOne({ _id: t._id }, { dueDate: dayToDeadline(addDays(today, -1)), status: 'done', 'reminders.overdueFor': null });
    expect((await runReminders(now)).overdue).toBe(0);
  });
});

describe('@mentions and editing comments', () => {
  it('notifies mentioned people who can see the task, and reports the rest', async () => {
    const t = await teamTask();
    const res = await request(app)
      .post(`${base(t)}/comments`)
      .set(auth(dev1))
      .send({ text: '@Parvez Head @Muskan Ops please look', mentions: [String(head.user._id), String(opsMember.user._id)] });
    expect(res.status).toBe(201);
    expect(res.body.skippedMentions).toEqual(['Muskan Ops']);
    await settle();
    const n = await Notification.findOne({ user: head.user._id, type: 'task_mention' });
    expect(n.text).toMatch(/mentioned you on/);
    // The head gets the mention, not a second "commented" notification.
    expect(await Notification.countDocuments({ user: head.user._id, type: 'task_comment' })).toBe(0);
    expect(await Notification.countDocuments({ user: opsMember.user._id })).toBe(0);
    expect(await Notification.countDocuments({ user: dev2.user._id, type: 'task_comment' })).toBe(1);
  });

  it('only the author edits; the author or a Super Admin deletes', async () => {
    const t = await teamTask();
    const c = (await request(app).post(`${base(t)}/comments`).set(auth(dev1)).send({ text: 'first draft' })).body.task.comments[0];
    expect((await request(app).patch(`${base(t)}/comments/${c._id}`).set(auth(dev2)).send({ text: 'x' })).status).toBe(403);
    const edited = await request(app).patch(`${base(t)}/comments/${c._id}`).set(auth(dev1)).send({ text: 'final text' });
    expect(edited.body.task.comments[0]).toMatchObject({ text: 'final text' });
    expect(edited.body.task.comments[0].editedAt).toBeTruthy();
    expect((await request(app).delete(`${base(t)}/comments/${c._id}`).set(auth(head)).send()).status).toBe(403);
    const admin = await createUser({ name: 'Admin', role: 'admin' });
    const del = await request(app).delete(`${base(t)}/comments/${c._id}`).set(auth(admin)).send();
    expect(del.body.task.comments).toHaveLength(0);
  });
});

describe('repeating tasks', () => {
  it('works out the next day for each schedule', () => {
    // 2026-11-20 is a Friday.
    expect(recurring.nextRunDay({ freq: 'daily' }, '2026-11-20')).toBe('2026-11-21');
    expect(recurring.nextRunDay({ freq: 'weekdays' }, '2026-11-20')).toBe('2026-11-23');
    expect(recurring.nextRunDay({ freq: 'weekly', weekday: 1 }, '2026-11-20')).toBe('2026-11-23');
    expect(recurring.nextRunDay({ freq: 'monthly', dayOfMonth: 31 }, '2026-11-20')).toBe('2026-11-30');
    expect(recurring.nextRunDay({ freq: 'monthly', dayOfMonth: 5 }, '2026-11-20')).toBe('2026-12-05');
  });

  it('creates the next task on schedule with the same details, once, and can be stopped', async () => {
    const today = istDay();
    const first = await teamTask({
      dueDate: addDays(today, 2),
      subtasks: ['Collect numbers'],
      repeat: { freq: 'weekly', weekday: 1 },
    });
    expect(first.recurring).toBeTruthy();
    const rt = await RecurringTask.findById(first.recurring);
    expect(rt).toMatchObject({ dueInDays: 2, title: 'Fix estimate PDF' });

    // Pretend it is due now.
    await RecurringTask.updateOne({ _id: rt._id }, { nextRunAt: new Date(Date.now() - 1000) });
    expect(await recurring.runDueRecurring()).toBe(1);
    expect(await recurring.runDueRecurring()).toBe(0);
    const tasks = await Task.find({ recurring: rt._id }).sort('number');
    expect(tasks).toHaveLength(2);
    const made = tasks[1];
    expect(String(made.assignee)).toBe(String(dev2.user._id));
    expect(made.subtasks.map((s) => s.title)).toEqual(['Collect numbers']);
    expect(made.dueDate.toISOString().slice(0, 10)).toBe(addDays(today, 2));
    await settle();
    expect(await Notification.countDocuments({ user: dev2.user._id, text: /Repeating task/ })).toBe(1);

    // Only the creator / head / admin can stop it.
    expect((await request(app).patch(`/api/recurring/${rt._id}`).set(auth(dev2)).send({ active: false })).status).toBe(403);
    const stopped = await request(app).patch(`/api/recurring/${rt._id}`).set(auth(head)).send({ active: false });
    expect(stopped.body.recurring.active).toBe(false);
    await RecurringTask.updateOne({ _id: rt._id }, { nextRunAt: new Date(Date.now() - 1000) });
    expect(await recurring.runDueRecurring()).toBe(0);
  });

  it('rejects a bad schedule', async () => {
    const res = await request(app).post('/api/tasks').set(auth(dev1)).send({ title: 'x', toTeam: String(tech._id), repeat: { freq: 'weekly', weekday: 9 } });
    expect(res.status).toBe(400);
  });
});

describe('web push', () => {
  it('reports push as off without keys and refuses subscriptions', async () => {
    const cfg = await request(app).get('/api/push/config').set(auth(dev1));
    expect(cfg.body).toEqual({ enabled: false, publicKey: null });
    const sub = await request(app)
      .post('/api/push/subscriptions')
      .set(auth(dev1))
      .send({ subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'a', auth: 'b' } } });
    expect(sub.status).toBe(400);
  });

  it('stores a valid subscription when keys are set, and removes it on unsubscribe', async () => {
    const webpush = require('web-push');
    const keys = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = keys.publicKey;
    process.env.VAPID_PRIVATE_KEY = keys.privateKey;
    try {
      expect((await request(app).get('/api/push/config').set(auth(dev1))).body.publicKey).toBe(keys.publicKey);
      const bad = await request(app).post('/api/push/subscriptions').set(auth(dev1)).send({ subscription: { endpoint: 'http://insecure', keys: { p256dh: 'a', auth: 'b' } } });
      expect(bad.status).toBe(400);
      const endpoint = 'https://fcm.googleapis.com/fcm/send/abc';
      const ok = await request(app).post('/api/push/subscriptions').set(auth(dev1)).send({ subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } } });
      expect(ok.status).toBe(201);
      expect(await PushSubscription.countDocuments({ user: dev1.user._id })).toBe(1);
      // Same device signing in as someone else moves the subscription.
      await request(app).post('/api/push/subscriptions').set(auth(dev2)).send({ subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } } });
      expect(await PushSubscription.countDocuments({ user: dev1.user._id })).toBe(0);
      await request(app).delete('/api/push/subscriptions').set(auth(dev2)).send({ endpoint });
      expect(await PushSubscription.countDocuments({})).toBe(0);
    } finally {
      delete process.env.VAPID_PUBLIC_KEY;
      delete process.env.VAPID_PRIVATE_KEY;
    }
  });
});
