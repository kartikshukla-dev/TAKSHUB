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
let ops;
let head;
let dev1;
let dev2;
let opsMember;

const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
// Notifications are written after the response; give them a tick.
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

beforeEach(async () => {
  emailService.setTransporter({ sendMail: jest.fn().mockResolvedValue(true) });
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

describe('Direct assignment inside your own team', () => {
  it('lets a member assign a task to a teammate directly and tells the head who got it', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set(auth(dev1))
      .send({ title: 'Fix estimate PDF', toTeam: String(tech._id), assignee: String(dev2.user._id), dueDate: day(3) });

    expect(res.status).toBe(201);
    expect(String(res.body.task.assignee._id)).toBe(String(dev2.user._id));
    expect(res.body.task.dueDate).toBeTruthy();

    await settle();
    const forHead = await Notification.find({ user: head.user._id });
    expect(forHead).toHaveLength(1);
    expect(forHead[0].type).toBe('task_assigned_in_team');
    expect(forHead[0].text).toMatch(/assigned .* to Neha Dev \(Tech\)/);
    expect(await Notification.countDocuments({ user: dev2.user._id, type: 'task_assigned' })).toBe(1);
  });

  it('only allows teammates as the assignee', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set(auth(dev1))
      .send({ title: 'Wrong person', toTeam: String(tech._id), assignee: String(opsMember.user._id) });
    expect(res.status).toBe(400);
  });

  it('lets a teammate reassign an in-team task later', async () => {
    const created = (
      await request(app).post('/api/tasks').set(auth(dev1)).send({ title: 'In-team', toTeam: String(tech._id), assignee: String(dev1.user._id) })
    ).body.task;
    const res = await request(app)
      .patch(`/api/projects/${created.project._id}/tasks/${created._id}`)
      .set(auth(dev2))
      .send({ assignee: String(dev2.user._id), dueDate: day(5) });
    expect(res.status).toBe(200);
    expect(String(res.body.task.assignee._id)).toBe(String(dev2.user._id));
  });
});

describe('Other teams still go through their head', () => {
  it('blocks a member from assigning a task they send to another team', async () => {
    const res = await request(app)
      .post('/api/tasks')
      .set(auth(opsMember))
      .send({ title: 'Need a report', toTeam: String(tech._id), assignee: String(dev1.user._id) });
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/Only the Tech head can assign/);
  });

  it('blocks a member of the receiving team from assigning a task another team raised', async () => {
    const created = (await request(app).post('/api/tasks').set(auth(opsMember)).send({ title: 'From Ops', toTeam: String(tech._id) })).body.task;
    const res = await request(app)
      .patch(`/api/projects/${created.project._id}/tasks/${created._id}`)
      .set(auth(dev1))
      .send({ assignee: String(dev1.user._id) });
    expect(res.status).toBe(403);

    const byHead = await request(app)
      .patch(`/api/projects/${created.project._id}/tasks/${created._id}`)
      .set(auth(head))
      .send({ assignee: String(dev1.user._id), dueDate: day(2) });
    expect(byHead.status).toBe(200);
  });

  it('sends a raised task to the head as a request when no one is assigned', async () => {
    const res = await request(app).post('/api/tasks').set(auth(opsMember)).send({ title: 'Please help', toTeam: String(tech._id) });
    expect(res.status).toBe(201);
    await settle();
    const n = await Notification.findOne({ user: head.user._id });
    expect(n.type).toBe('task_request');
  });
});
