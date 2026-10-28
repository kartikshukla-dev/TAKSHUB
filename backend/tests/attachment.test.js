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

async function createProject(token) {
  const res = await request(app)
    .post('/api/projects')
    .set('Authorization', `Bearer ${token}`)
    .send({ name: 'Attach Project', key: `AT${Math.floor(Math.random() * 100000)}` });
  return res.body.project;
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

describe('Attachments via GridFS', () => {
  it('uploads a file to a task and downloads the same bytes back', async () => {
    const admin = await registerAndLogin();
    const project = await createProject(admin.token);

    const created = await request(app)
      .post(`/api/projects/${project._id}/tasks`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'Attach a spec doc' });
    const taskId = created.body.task._id;

    const fileContent = Buffer.from('This is the content of the attached file.');

    const uploadRes = await request(app)
      .post(`/api/projects/${project._id}/tasks/${taskId}/attachments`)
      .set('Authorization', `Bearer ${admin.token}`)
      .attach('file', fileContent, 'spec.txt');

    expect(uploadRes.status).toBe(201);
    expect(uploadRes.body.task.attachments).toHaveLength(1);

    const fileId = uploadRes.body.task.attachments[0].fileId;

    const downloadRes = await request(app)
      .get(`/api/projects/${project._id}/tasks/${taskId}/attachments/${fileId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .buffer()
      .parse((res, callback) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => callback(null, Buffer.concat(chunks)));
      });

    expect(downloadRes.status).toBe(200);
    expect(Buffer.compare(downloadRes.body, fileContent)).toBe(0);
  });
});
