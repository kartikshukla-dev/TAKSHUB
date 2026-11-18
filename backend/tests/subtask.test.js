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
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

beforeEach(() => {
  emailService.setTransporter({ sendMail: jest.fn().mockResolvedValue(true) });
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

async function setup() {
  const tech = await Department.create({ name: 'Tech' });
  const ops = await Department.create({ name: 'Operations' });
  const dev1 = await createUser({ name: 'Arjun Dev', department: tech._id });
  const dev2 = await createUser({ name: 'Neha Dev', department: tech._id });
  const opsUser = await createUser({ name: 'Muskan Ops', department: ops._id });
  const outsider = await createUser({ name: 'Out Sider', department: ops._id });
  const task = (
    await request(app)
      .post('/api/tasks')
      .set(auth(dev1))
      .send({ title: 'Release v2', toTeam: String(tech._id), subtasks: ['Write notes', { title: 'Tag build' }] })
  ).body.task;
  const base = `/api/projects/${task.project._id}/tasks/${task._id}/subtasks`;
  return { tech, dev1, dev2, opsUser, outsider, task, base };
}

describe('Subtasks', () => {
  it('creates a task with subtasks in order', async () => {
    const { task } = await setup();
    expect(task.subtasks.map((s) => s.title)).toEqual(['Write notes', 'Tag build']);
    expect(task.subtasks.every((s) => s.done === false)).toBe(true);
  });

  it('adds, ticks, assigns, sets a deadline and deletes, logging each step', async () => {
    const { dev1, dev2, base } = await setup();
    let res = await request(app).post(base).set(auth(dev1)).send({ title: 'QA pass', assignee: String(dev2.user._id), dueDate: '2030-01-05' });
    expect(res.status).toBe(201);
    const qa = res.body.task.subtasks.find((s) => s.title === 'QA pass');
    expect(qa.assignee.name).toBe('Neha Dev');

    res = await request(app).patch(`${base}/${qa._id}`).set(auth(dev2)).send({ done: true });
    const done = res.body.task.subtasks.find((s) => s._id === qa._id);
    expect(done.done).toBe(true);
    expect(done.completedAt).toBeTruthy();

    res = await request(app).delete(`${base}/${qa._id}`).set(auth(dev1));
    expect(res.body.task.subtasks).toHaveLength(2);

    const log = res.body.task.activityLog.filter((e) => e.field === 'subtask').map((e) => e.newValue);
    expect(log).toEqual(['added: QA pass', 'completed: QA pass', 'removed: QA pass']);

    await settle();
    expect(await Notification.countDocuments({ user: dev2.user._id, type: 'subtask_assigned' })).toBe(1);
  });

  it('only lets team members be assigned on a team task', async () => {
    const { dev1, opsUser, base } = await setup();
    const res = await request(app).post(base).set(auth(dev1)).send({ title: 'Wrong', assignee: String(opsUser.user._id) });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not in the Tech team/);
  });

  it('blocks people who cannot see the task', async () => {
    const { outsider, base } = await setup();
    const res = await request(app).post(base).set(auth(outsider)).send({ title: 'Sneaky' });
    expect(res.status).toBe(403);
  });

  it('reorders subtasks and rejects partial lists', async () => {
    const { dev1, task, base } = await setup();
    const [a, b] = task.subtasks.map((s) => s._id);
    expect((await request(app).put(`${base}/order`).set(auth(dev1)).send({ ids: [b] })).status).toBe(400);
    const res = await request(app).put(`${base}/order`).set(auth(dev1)).send({ ids: [b, a] });
    expect(res.body.task.subtasks.map((s) => s.title)).toEqual(['Tag build', 'Write notes']);
  });

  it('rejects empty titles', async () => {
    const { dev1, base } = await setup();
    expect((await request(app).post(base).set(auth(dev1)).send({ title: '  ' })).status).toBe(400);
  });
});
