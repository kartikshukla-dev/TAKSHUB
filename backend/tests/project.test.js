require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');

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

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

describe('Project CRUD + permissions', () => {
  it('allows an admin to create a project', async () => {
    const { token } = await registerAndLogin({ role: 'admin' });

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'TaskHub Core', description: 'Main product', key: 'THC' });

    expect(res.status).toBe(201);
    expect(res.body.project.key).toBe('THC');
    expect(res.body.project.members).toHaveLength(1);
  });

  it('rejects project creation from a member role', async () => {
    const { token } = await registerAndLogin({ role: 'member' });

    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Blocked', key: 'BLK' });

    expect(res.status).toBe(403);
  });

  it('lists only projects a member belongs to, but admin sees all', async () => {
    const admin = await registerAndLogin({ role: 'admin' });
    const member = await registerAndLogin({ role: 'member' });

    await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Admin Only', key: 'ADM' });

    const memberList = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${member.token}`);
    expect(memberList.body.projects).toHaveLength(0);

    const adminList = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminList.body.projects).toHaveLength(1);
  });

  it('allows an admin to add a member to a project', async () => {
    const admin = await registerAndLogin({ role: 'admin' });
    const member = await registerAndLogin({ role: 'member' });

    const created = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ name: 'Team Project', key: 'TMP' });

    const projectId = created.body.project._id;

    const res = await request(app)
      .post(`/api/projects/${projectId}/members`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ userId: member.user.id });

    expect(res.status).toBe(200);
    expect(res.body.project.members).toHaveLength(2);
  });
});
