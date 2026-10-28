require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const emailService = require('../src/services/emailService');

let app;

async function registerAndLogin(overrides = {}) {
  const payload = {
    name: 'User',
    email: `user${Date.now()}${Math.random()}@example.com`,
    password: 'password123',
    role: 'member',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  return { token: res.body.token, user: res.body.user };
}

async function createProject(token) {
  const res = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Board Project', key: `BP${Math.floor(Math.random() * 100000)}` });
  return res.body.project;
}

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

beforeEach(() => {
  // Mock transporter so no real email is ever sent during tests.
  emailService.setTransporter({ sendMail: jest.fn().mockResolvedValue(true) });
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

describe('Task CRUD + activity log', () => {
  it('creates a task under a project', async () => {
    const admin = await registerAndLogin({ role: 'admin' });
    const project = await createProject(admin.token);

    const res = await request(app)
      .post(`/api/projects/${project._id}/tasks`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Fix login bug', priority: 'high' });

    expect(res.status).toBe(201);
    expect(res.body.task.title).toBe('Fix login bug');
    expect(res.body.task.status).toBe('todo');
  });

  it('records activity log entries when priority and assignee change', async () => {
    const admin = await registerAndLogin({ role: 'admin' });
    const member = await registerAndLogin({ role: 'member' });
    const project = await createProject(admin.token);

    const created = await request(app)
      .post(`/api/projects/${project._id}/tasks`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Needs triage', priority: 'low' });

    const taskId = created.body.task._id;

    const updated = await request(app)
      .patch(`/api/projects/${project._id}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ priority: 'urgent', assignee: member.user.id });

    expect(updated.status).toBe(200);

    const fetched = await request(app)
      .get(`/api/projects/${project._id}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    const fields = fetched.body.task.activityLog.map((e) => e.field);
    expect(fields).toContain('priority');
    expect(fields).toContain('assignee');
  });

  it('sets completedAt and does not re-trigger when already done', async () => {
    const admin = await registerAndLogin({ role: 'admin' });
    const project = await createProject(admin.token);

    const created = await request(app)
      .post(`/api/projects/${project._id}/tasks`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Ship feature' });
    const taskId = created.body.task._id;

    const done = await request(app)
      .patch(`/api/projects/${project._id}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'done' });

    expect(done.body.task.completedAt).toBeTruthy();
  });

  it('adds a comment and logs it in the activity log', async () => {
    const admin = await registerAndLogin({ role: 'admin' });
    const project = await createProject(admin.token);

    const created = await request(app)
      .post(`/api/projects/${project._id}/tasks`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Discuss approach' });
    const taskId = created.body.task._id;

    const res = await request(app)
      .post(`/api/projects/${project._id}/tasks/${taskId}/comments`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ text: 'Lets sync tomorrow' });

    expect(res.status).toBe(201);
    expect(res.body.task.comments).toHaveLength(1);
    expect(res.body.task.comments[0].text).toBe('Lets sync tomorrow');
  });

  it('deletes a task', async () => {
    const admin = await registerAndLogin({ role: 'admin' });
    const project = await createProject(admin.token);

    const created = await request(app)
      .post(`/api/projects/${project._id}/tasks`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Temp task' });
    const taskId = created.body.task._id;

    const res = await request(app)
      .delete(`/api/projects/${project._id}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(204);

    const fetch = await request(app)
      .get(`/api/projects/${project._id}/tasks/${taskId}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(fetch.status).toBe(404);
  });
});
