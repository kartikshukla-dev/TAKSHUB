require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const { createUser } = require('./helpers');
const Department = require('../src/models/Department');
const Notification = require('../src/models/Notification');
const emailService = require('../src/services/emailService');

let app;
let tech;
let head;
let dev1;
let dev2;
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

beforeEach(async () => {
  emailService.setTransporter({ sendMail: jest.fn().mockResolvedValue(true) });
  tech = await Department.create({ name: 'Tech' });
  head = await createUser({ name: 'Parvez Head', role: 'manager', department: tech._id });
  dev1 = await createUser({ name: 'Arjun Dev', department: tech._id });
  dev2 = await createUser({ name: 'Neha Dev', department: tech._id });
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

const base = (t) => `/api/projects/${t.project._id}/tasks/${t._id}`;
const readOf = (task, u) => (task.commentReads || []).find((r) => String(r.user) === String(u.user._id));

describe('comment seen tracking', () => {
  it('the commenter has seen it, the other person has not until they open the task', async () => {
    const t = (await request(app).post('/api/tasks').set(auth(dev1)).send({ title: 'Fix PDF', toTeam: String(tech._id), assignee: String(dev2.user._id) })).body.task;
    const c = await request(app).post(`${base(t)}/comments`).set(auth(dev1)).send({ text: 'Please check the footer' });
    expect(c.status).toBe(201);
    expect(readOf(c.body.task, dev1)).toBeTruthy();
    expect(readOf(c.body.task, dev2)).toBeUndefined();

    // The assignee gets a bell notification and sees it in the list as unread.
    await settle();
    expect(await Notification.countDocuments({ user: dev2.user._id, type: 'task_comment' })).toBe(1);
    const list = await request(app).get('/api/tasks').set(auth(dev2));
    const row = list.body.tasks.find((x) => String(x._id) === String(t._id));
    expect(row.comments).toHaveLength(1);
    expect(readOf(row, dev2)).toBeUndefined();

    // Opening the task marks it seen and returns the previous time (none).
    const opened = await request(app).get(base(t)).set(auth(dev2));
    expect(opened.body.commentsSeenAt).toBeNull();
    const again = await request(app).get(base(t)).set(auth(dev2));
    expect(again.body.commentsSeenAt).toBeTruthy();
    expect(readOf(again.body.task, dev2)).toBeTruthy();
  });

  it('marking seen does not change "last updated"', async () => {
    const t = (await request(app).post('/api/tasks').set(auth(dev1)).send({ title: 'Fix PDF', toTeam: String(tech._id) })).body.task;
    await request(app).post(`${base(t)}/comments`).set(auth(dev1)).send({ text: 'hi' });
    const before = (await request(app).get('/api/tasks').set(auth(head))).body.tasks[0].updatedAt;
    await new Promise((r) => setTimeout(r, 20));
    const seen = await request(app).post(`${base(t)}/seen`).set(auth(head));
    expect(seen.status).toBe(200);
    const after = (await request(app).get('/api/tasks').set(auth(head))).body.tasks[0];
    expect(after.updatedAt).toBe(before);
    expect(readOf(after, head)).toBeTruthy();
  });
});
