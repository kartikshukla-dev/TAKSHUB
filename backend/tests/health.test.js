require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb } = require('./setupTestDb');
const createApp = require('../src/app');

let app;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

afterAll(async () => {
  await stopTestDb();
});

describe('GET /api/health', () => {
  it('returns 200 with ok status and a connected db', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.db).toBe('connected');
    expect(res.body.timestamp).toBeDefined();
  });
});
