require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');

let app;

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

describe('POST /api/auth/register', () => {
  it('registers a new user and returns a token', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Asha Admin',
      email: 'asha@example.com',
      password: 'password123',
      role: 'admin',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('asha@example.com');
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.passwordHash).toBeUndefined();
  });

  it('rejects duplicate email registration', async () => {
    await request(app).post('/api/auth/register').send({
      name: 'User One',
      email: 'dup@example.com',
      password: 'password123',
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'User Two',
      email: 'dup@example.com',
      password: 'password456',
    });

    expect(res.status).toBe(409);
  });

  it('rejects short passwords', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Short Pass',
      email: 'short@example.com',
      password: '123',
    });
    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/api/auth/register').send({
      name: 'Login User',
      email: 'login@example.com',
      password: 'correctpass',
    });
  });

  it('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'correctpass',
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
  });

  it('rejects wrong password', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'login@example.com',
      password: 'wrongpass',
    });
    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user when given a valid token', async () => {
    const register = await request(app).post('/api/auth/register').send({
      name: 'Me User',
      email: 'me@example.com',
      password: 'password123',
    });
    const token = register.body.token;

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
