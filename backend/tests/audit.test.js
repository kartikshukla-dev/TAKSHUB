require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const { createUser } = require('./helpers');
const AuditLog = require('../src/models/AuditLog');
const LoginCode = require('../src/models/LoginCode');
const emailService = require('../src/services/emailService');

let app;
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
// Logs are written after the response is sent.
const settle = () => new Promise((r) => setTimeout(r, 200));

beforeAll(async () => {
  await startTestDb();
  await AuditLog.init();
  app = createApp();
}, 60000);

beforeEach(() => {
  emailService.setTransporter({ sendMail: jest.fn().mockResolvedValue({ messageId: 'm' }) });
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

async function project(admin) {
  return (await request(app).post('/api/projects').set(auth(admin)).send({ name: 'Ops', key: `OP${Date.now() % 100000}` })).body.project;
}

describe('audit log', () => {
  it('records task create and update with who, what, before and after', async () => {
    const admin = await createUser({ name: 'Kartik Shukla', role: 'admin' });
    const p = await project(admin);
    const t = (await request(app).post(`/api/projects/${p._id}/tasks`).set(auth(admin)).send({ title: 'Fix PDF', priority: 'low' })).body.task;
    await request(app).patch(`/api/projects/${p._id}/tasks/${t._id}`).set(auth(admin)).set('User-Agent', 'jest-agent').send({ priority: 'urgent' });
    await settle();

    const created = await AuditLog.findOne({ action: 'task.create' });
    expect(created).toMatchObject({ actorName: 'Kartik Shukla', actorRole: 'admin', entity: 'task', entityId: String(t._id), ok: true });
    expect(created.changes.created.title).toBe('Fix PDF');

    const updated = await AuditLog.findOne({ action: 'task.update' });
    expect(updated.changes.priority).toEqual({ from: 'low', to: 'urgent' });
    expect(updated.userAgent).toBe('jest-agent');
    expect(updated.ip).toBeTruthy();
    expect(updated.entityLabel).toMatch(/Fix PDF/);
  });

  it('records failed actions with the error message', async () => {
    const member = await createUser({ name: 'Muskan', role: 'member' });
    await request(app).post('/api/projects').set(auth(member)).send({ name: 'Nope', key: 'NOPE' });
    await settle();
    const log = await AuditLog.findOne({ action: 'project.create.failed' });
    expect(log).toMatchObject({ ok: false, status: 403, actorName: 'Muskan' });
    expect(log.error).toBeTruthy();
  });

  it('logs sign-in success and failure but never the code itself', async () => {
    const user = await createUser({ name: 'Rahul', email: 'rahul@example.com' });
    await request(app).post('/api/auth/otp/request').send({ email: 'rahul@example.com' });
    await request(app).post('/api/auth/otp/verify').send({ email: 'rahul@example.com', code: '000000' });
    await settle();
    const failed = await AuditLog.findOne({ action: 'auth.login.failed' });
    expect(failed).toMatchObject({ ok: false, actorEmail: 'rahul@example.com' });
    expect(failed.changes.request.code).toBe('[hidden]');
    expect(JSON.stringify(failed)).not.toMatch(/000000/);
    expect(await AuditLog.countDocuments({ action: 'auth.code_requested' })).toBe(1);

    // A real code: grab it from the mail the mock "sent".
    await LoginCode.deleteMany({});
    const mail = { sendMail: jest.fn().mockResolvedValue({ messageId: 'x' }) };
    emailService.setTransporter(mail);
    await request(app).post('/api/auth/otp/request').send({ email: 'rahul@example.com' });
    const code = /(\d{6})/.exec(mail.sendMail.mock.calls[0][0].subject)[1];
    await request(app).post('/api/auth/otp/verify').send({ email: 'rahul@example.com', code });
    await request(app).post('/api/auth/logout').set(auth(user));
    await settle();
    expect(await AuditLog.findOne({ action: 'auth.login' })).toMatchObject({ ok: true, actorName: 'Rahul' });
    expect(await AuditLog.findOne({ action: 'auth.logout' })).toMatchObject({ actorName: 'Rahul' });
    expect(await AuditLog.countDocuments({ action: 'email.sent' })).toBeGreaterThan(0);
  });

  it('keeps chat message text out of the log', async () => {
    const a = await createUser({ name: 'A' });
    const b = await createUser({ name: 'B' });
    const conv = (await request(app).post('/api/chat/conversations').set(auth(a)).send({ type: 'direct', userId: String(b.user._id) })).body.conversation;
    await request(app).post(`/api/chat/conversations/${conv._id}/messages`).set(auth(a)).send({ text: 'salary details here' });
    await settle();
    const log = await AuditLog.findOne({ action: 'chat.message_send' });
    expect(log).toBeTruthy();
    expect(JSON.stringify(log)).not.toMatch(/salary/);
  });

  it('skips plain reads', async () => {
    const admin = await createUser({ role: 'admin' });
    await request(app).get('/api/tasks').set(auth(admin));
    await request(app).get('/api/stats/dashboard').set(auth(admin));
    await settle();
    expect(await AuditLog.countDocuments({})).toBe(0);
  });

  it('is read-only and only Super Admins can view or export it', async () => {
    const admin = await createUser({ role: 'admin' });
    const member = await createUser({ role: 'member' });
    await project(admin);
    await settle();
    expect((await request(app).get('/api/admin/audit').set(auth(member))).status).toBe(403);
    const list = await request(app).get('/api/admin/audit?category=project').set(auth(admin));
    expect(list.body.logs).toHaveLength(1);
    const csv = await request(app).get('/api/admin/audit/export').set(auth(admin));
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text).toMatch(/project.create/);

    await expect(AuditLog.updateOne({}, { action: 'x' })).rejects.toThrow(/read-only/);
    await expect(AuditLog.deleteMany({})).rejects.toThrow(/read-only/);
  });
});
