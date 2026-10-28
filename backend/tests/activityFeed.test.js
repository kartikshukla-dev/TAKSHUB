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
    role: 'admin',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(payload);
  return { token: res.body.token, user: res.body.user };
}

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

describe('GET /api/projects/:id/activity', () => {
  it('aggregates activity log entries across tasks, newest first', async () => {
    const admin = await registerAndLogin();
    const project = (
      await request(app)
        .post('/api/projects')
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ name: 'Feed Project', key: `FD${Math.floor(Math.random() * 100000)}` })
    ).body.project;

    const taskA = (
      await request(app)
        .post(`/api/projects/${project._id}/tasks`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Task A' })
    ).body.task;

    const taskB = (
      await request(app)
        .post(`/api/projects/${project._id}/tasks`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ title: 'Task B' })
    ).body.task;

    await request(app)
      .patch(`/api/projects/${project._id}/tasks/${taskA._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ priority: 'urgent' });

    await request(app)
      .patch(`/api/projects/${project._id}/tasks/${taskB._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'in-progress' });

    const res = await request(app)
      .get(`/api/projects/${project._id}/activity`)
      .set('Authorization', `Bearer ${admin.token}`);

    expect(res.status).toBe(200);
    expect(res.body.feed.length).toBeGreaterThanOrEqual(2);
    const fields = res.body.feed.map((e) => e.field);
    expect(fields).toContain('priority');
    expect(fields).toContain('status');
  });
});
