require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const emailService = require('../src/services/emailService');
const { createUser } = require('./helpers');

let app;
let mail;

beforeAll(async () => {
  await startTestDb();
  app = createApp();
}, 60000);

beforeEach(() => {
  mail = { sendMail: jest.fn().mockResolvedValue({ messageId: 'm' }) };
  emailService.setTransporter(mail);
});

afterEach(async () => {
  await clearTestDb();
  delete process.env.SUPERADMIN_EMAIL;
});

afterAll(async () => {
  await stopTestDb();
});

// Reads the 6-digit code out of the last email sent.
function lastCode() {
  const call = mail.sendMail.mock.calls[mail.sendMail.mock.calls.length - 1][0];
  return call.text.match(/\b(\d{6})\b/)[1];
}

describe('email + one-time code sign-in', () => {
  it('emails a code to an invited user and signs them in with it', async () => {
    await createUser({ email: 'asha@example.com', status: 'invited' });

    const req = await request(app).post('/api/auth/otp/request').send({ email: 'Asha@Example.com' });
    expect(req.status).toBe(200);
    expect(mail.sendMail).toHaveBeenCalledTimes(1);
    expect(mail.sendMail.mock.calls[0][0].to).toBe('asha@example.com');

    const res = await request(app).post('/api/auth/otp/verify').send({ email: 'asha@example.com', code: lastCode() });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.status).toBe('active');
  });

  it('does not reveal or email unknown addresses', async () => {
    const res = await request(app).post('/api/auth/otp/request').send({ email: 'nobody@example.com' });
    expect(res.status).toBe(200);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it('rejects a wrong code and locks after too many tries', async () => {
    await createUser({ email: 'lock@example.com' });
    await request(app).post('/api/auth/otp/request').send({ email: 'lock@example.com' });
    const good = lastCode();
    const bad = good === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const r = await request(app).post('/api/auth/otp/verify').send({ email: 'lock@example.com', code: bad });
      expect(r.status).toBe(400);
    }
    const locked = await request(app).post('/api/auth/otp/verify').send({ email: 'lock@example.com', code: good });
    expect(locked.status).toBe(429);
  });

  it('rate-limits asking for codes', async () => {
    await createUser({ email: 'rate@example.com' });
    await request(app).post('/api/auth/otp/request').send({ email: 'rate@example.com' });
    const again = await request(app).post('/api/auth/otp/request').send({ email: 'rate@example.com' });
    expect(again.status).toBe(429);
  });

  it('creates the Super Admin from SUPERADMIN_EMAIL on first sign-in', async () => {
    process.env.SUPERADMIN_EMAIL = 'boss@example.com';
    await request(app).post('/api/auth/otp/request').send({ email: 'boss@example.com' });
    const res = await request(app).post('/api/auth/otp/verify').send({ email: 'boss@example.com', code: lastCode() });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('blocks disabled accounts', async () => {
    const { token } = await createUser({ email: 'off@example.com', status: 'disabled' });
    await request(app).post('/api/auth/otp/request').send({ email: 'off@example.com' });
    expect(mail.sendMail).not.toHaveBeenCalled();
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(401);
  });

  it('has no password sign-up or login', async () => {
    expect((await request(app).post('/api/auth/register').send({ email: 'a@b.c', password: 'x' })).status).toBe(404);
    expect((await request(app).post('/api/auth/login').send({ email: 'a@b.c', password: 'x' })).status).toBe(404);
  });
});

describe('GET /api/auth/me', () => {
  it('returns the authenticated user when given a valid token', async () => {
    const { token } = await createUser({ email: 'me@example.com' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('me@example.com');
  });

  it('rejects requests without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });
});
