require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';
// Request logs are off in tests unless asked for.
process.env.REQUEST_LOG_DB = 'on';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const { createUser } = require('./helpers');
const RequestLog = require('../src/models/RequestLog');
const { flushRequestLogs, safeQuery } = require('../src/middleware/requestLogger');

let app;
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const flush = async () => {
  await new Promise((r) => setTimeout(r, 50));
  await flushRequestLogs();
};

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

describe('request log (morgan)', () => {
  it('records every request, reads included, with the signed-in user', async () => {
    const admin = await createUser({ name: 'Kartik', email: 'kartik@example.com', role: 'admin' });
    await request(app).get('/api/tasks?status=todo').set(auth(admin)).set('User-Agent', 'jest');
    await request(app).get('/api/nope');
    await request(app).get('/api/health');
    await flush();

    const rows = await RequestLog.find().sort({ at: 1 }).lean();
    expect(rows.map((r) => `${r.method} ${r.path} ${r.status}`)).toEqual(['GET /api/tasks 200', 'GET /api/nope 404']);
    expect(rows[0]).toMatchObject({ userEmail: 'kartik@example.com', userRole: 'admin', query: '?status=todo', userAgent: 'jest' });
    expect(rows[0].ms).toBeGreaterThanOrEqual(0);
    expect(rows[1].userEmail).toBe('');
  });

  it('masks secrets in query strings', () => {
    expect(safeQuery('/api/auth/google/callback?code=abc&scope=email&state=xyz')).toBe('?code=***&scope=email&state=***');
    expect(safeQuery('/api/tasks')).toBe('');
  });

  it('lets only Super Admins read and filter the request log', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser({ role: 'member' });
    await request(app).get('/api/tasks').set(auth(member));
    await request(app).post('/api/projects').set(auth(member)).send({ name: 'x', key: 'XX' });
    await flush();
    expect((await request(app).get('/api/admin/requests').set(auth(member))).status).toBe(403);
    const failed = await request(app).get('/api/admin/requests?status=4xx').set(auth(admin));
    expect(failed.body.logs.map((l) => l.path)).toEqual(['/api/projects']);
    const csv = await request(app).get('/api/admin/requests/export').set(auth(admin));
    expect(csv.text).toMatch(/\/api\/tasks/);
  });
});
