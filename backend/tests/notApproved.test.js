require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const { createUser } = require('./helpers');
const Department = require('../src/models/Department');
const emailService = require('../src/services/emailService');

let app;
let tech;
let ops;
let head;
let opsHead;
let dev1;
let dev2;
let admin;

const auth = (u) => ({ Authorization: `Bearer ${u.token}` });

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

beforeEach(async () => {
  emailService.setTransporter({ sendMail: jest.fn().mockResolvedValue(true) });
  tech = await Department.create({ name: 'Tech' });
  ops = await Department.create({ name: 'Operations' });
  head = await createUser({ name: 'Parvez Head', role: 'manager', department: tech._id });
  opsHead = await createUser({ name: 'Ops Head', role: 'manager', department: ops._id });
  dev1 = await createUser({ name: 'Arjun Dev', department: tech._id });
  dev2 = await createUser({ name: 'Neha Dev', department: tech._id });
  admin = await createUser({ name: 'Super Admin', role: 'admin' });
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

async function teamTask() {
  const res = await request(app)
    .post('/api/tasks')
    .set(auth(dev1))
    .send({ title: 'Fix estimate PDF', toTeam: String(tech._id), assignee: String(dev2.user._id) });
  return res.body.task;
}
const patch = (u, t, body) => request(app).patch(`/api/projects/${t.project._id}/tasks/${t._id}`).set(auth(u)).send(body);

describe('Not approved status', () => {
  it('only the team head can mark a task Not approved', async () => {
    const t = await teamTask();
    expect((await patch(dev2, t, { status: 'not-approved', notApprovedReason: 'Numbers are wrong' })).status).toBe(403);
    expect((await patch(dev1, t, { status: 'not-approved', notApprovedReason: 'Numbers are wrong' })).status).toBe(403);
    expect((await patch(opsHead, t, { status: 'not-approved', notApprovedReason: 'Numbers are wrong' })).status).toBe(403);
    const res = await patch(head, t, { status: 'not-approved', notApprovedReason: 'Numbers are wrong' });
    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe('not-approved');
  });

  it('once Not approved, only the head (or a Super Admin) can change the status', async () => {
    const t = await teamTask();
    await patch(head, t, { status: 'not-approved', notApprovedReason: 'Numbers are wrong' });
    const blocked = await patch(dev2, t, { status: 'in-progress' });
    expect(blocked.status).toBe(403);
    expect(blocked.body.message).toMatch(/Only the team head/);
    // Other fields can still be edited by the team.
    expect((await patch(dev2, t, { description: 'More detail' })).status).toBe(200);

    const reopened = await patch(head, t, { status: 'todo' });
    expect(reopened.body.task.status).toBe('todo');
    await patch(admin, t, { status: 'not-approved', notApprovedReason: 'Numbers are wrong' });
    expect((await patch(admin, t, { status: 'done' })).body.task.status).toBe('done');
  });

  it('team members can see and filter Not approved tasks', async () => {
    const t = await teamTask();
    await patch(head, t, { status: 'not-approved', notApprovedReason: 'Numbers are wrong' });
    const list = await request(app).get('/api/tasks?status=not-approved').set(auth(dev2));
    expect(list.status).toBe(200);
    expect(list.body.tasks.map((x) => String(x._id))).toContain(String(t._id));
  });

  it('a new task cannot start as Not approved', async () => {
    const res = await request(app).post('/api/tasks').set(auth(head)).send({ title: 'x', toTeam: String(tech._id), status: 'not-approved' });
    expect(res.status).toBe(400);
  });
});
