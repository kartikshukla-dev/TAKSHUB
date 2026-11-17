require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const { createUser } = require('./helpers');
const Notification = require('../src/models/Notification');
const { resetBucket } = require('../src/services/gridfsService');

let app;
let a;
let b;
let c;
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeAll(async () => {
  await startTestDb();
  resetBucket();
  app = createApp();
}, 60000);

beforeEach(async () => {
  a = await createUser({ name: 'Anvi Singh' });
  b = await createUser({ name: 'Rahul Dev' });
  c = await createUser({ name: 'Neha Kapoor' });
});

afterEach(async () => {
  await clearTestDb();
});

afterAll(async () => {
  await stopTestDb();
});

async function group(members = [b, c]) {
  const res = await request(app)
    .post('/api/chat/conversations')
    .set(auth(a))
    .send({ type: 'group', name: 'Data', memberIds: members.map((m) => String(m.user._id)) });
  return res.body.conversation;
}
const send = (u, convId, body) => request(app).post(`/api/chat/conversations/${convId}/messages`).set(auth(u)).send(body);

describe('chat messages', () => {
  it('edits and deletes only your own messages', async () => {
    const conv = await group();
    const msg = (await send(a, conv._id, { text: 'hello' })).body.message;

    expect((await request(app).patch(`/api/chat/messages/${msg._id}`).set(auth(b)).send({ text: 'x' })).status).toBe(403);
    const edited = await request(app).patch(`/api/chat/messages/${msg._id}`).set(auth(a)).send({ text: 'hello team' });
    expect(edited.body.message.text).toBe('hello team');
    expect(edited.body.message.editedAt).toBeTruthy();

    const del = await request(app).delete(`/api/chat/messages/${msg._id}`).set(auth(a));
    expect(del.body.message.deletedAt).toBeTruthy();
    expect(del.body.message.text).toBe('');
  });

  it('keeps thread replies out of the main list and counts them on the parent', async () => {
    const conv = await group();
    const parent = (await send(a, conv._id, { text: 'Report?' })).body.message;
    await send(b, conv._id, { text: 'Friday', parent: parent._id });
    await send(c, conv._id, { text: 'ok', parent: parent._id });

    const list = await request(app).get(`/api/chat/conversations/${conv._id}/messages`).set(auth(a));
    expect(list.body.messages).toHaveLength(1);
    expect(list.body.messages[0].replyCount).toBe(2);
    const thread = await request(app).get(`/api/chat/messages/${parent._id}/thread`).set(auth(b));
    expect(thread.body.replies.map((r) => r.text)).toEqual(['Friday', 'ok']);
  });

  it('toggles reactions per person', async () => {
    const conv = await group();
    const msg = (await send(a, conv._id, { text: 'done' })).body.message;
    await request(app).post(`/api/chat/messages/${msg._id}/reactions`).set(auth(b)).send({ emoji: '👍' });
    let r = await request(app).post(`/api/chat/messages/${msg._id}/reactions`).set(auth(c)).send({ emoji: '👍' });
    expect(r.body.message.reactions[0].users).toHaveLength(2);
    r = await request(app).post(`/api/chat/messages/${msg._id}/reactions`).set(auth(b)).send({ emoji: '👍' });
    expect(r.body.message.reactions[0].users).toEqual([String(c.user._id)]);
  });

  it('accepts long code as a snippet but not as plain text', async () => {
    const conv = await group();
    const code = Array.from({ length: 1200 }, (_, i) => `const line${i} = ${i};`).join('\n');
    expect((await send(a, conv._id, { text: code })).status).toBe(400);
    const res = await send(a, conv._id, { snippet: { title: 'utils.js', language: 'javascript', code } });
    expect(res.status).toBe(201);
    expect(res.body.message.snippet.code.split('\n')).toHaveLength(1200);
  });

  it('notifies people who are @mentioned, ignoring non-members', async () => {
    const outsider = await createUser({ name: 'Out Sider' });
    const conv = await group([b]);
    await send(a, conv._id, { text: '@Rahul Dev please check', mentions: [String(b.user._id), String(outsider.user._id)] });
    await settle();
    expect(await Notification.countDocuments({ user: b.user._id, type: 'chat_mention' })).toBe(1);
    expect(await Notification.countDocuments({ user: outsider.user._id })).toBe(0);
  });

  it('pins, saves and finds messages', async () => {
    const conv = await group();
    const msg = (await send(a, conv._id, { text: 'Deploy checklist is here' })).body.message;
    await request(app).post(`/api/chat/messages/${msg._id}/pin`).set(auth(b));
    const pins = await request(app).get(`/api/chat/conversations/${conv._id}/pins`).set(auth(c));
    expect(pins.body.messages).toHaveLength(1);

    const saved = await request(app).post(`/api/chat/messages/${msg._id}/save`).set(auth(b));
    expect(saved.body.message.saved).toBe(true);
    expect((await request(app).get('/api/chat/saved').set(auth(b))).body.messages).toHaveLength(1);
    expect((await request(app).get('/api/chat/saved').set(auth(c))).body.messages).toHaveLength(0);

    const found = await request(app).get('/api/chat/search?q=checklist').set(auth(c));
    expect(found.body.messages).toHaveLength(1);
    const outsider = await createUser({ name: 'Out Sider' });
    expect((await request(app).get('/api/chat/search?q=checklist').set(auth(outsider))).body.messages).toHaveLength(0);
  });

  it('shares files in chat and only lets members download them', async () => {
    const conv = await group([b]);
    const res = await request(app)
      .post(`/api/chat/conversations/${conv._id}/messages`)
      .set(auth(a))
      .field('text', 'see attached')
      .attach('files', Buffer.from('hello file'), 'notes.txt');
    expect(res.status).toBe(201);
    const file = res.body.message.files[0];
    const ok = await request(app).get(`/api/chat/messages/${res.body.message._id}/files/${file.fileId}`).set(auth(b));
    expect(ok.status).toBe(200);
    const no = await request(app).get(`/api/chat/messages/${res.body.message._id}/files/${file.fileId}`).set(auth(c));
    expect(no.status).toBe(404);
  });
});

describe('channels and conversation settings', () => {
  it('lets anyone browse and join a channel, and rejects duplicate names', async () => {
    const ch = (await request(app).post('/api/chat/conversations').set(auth(a)).send({ type: 'channel', name: 'general' })).body.conversation;
    expect((await request(app).post('/api/chat/conversations').set(auth(b)).send({ type: 'channel', name: 'General' })).status).toBe(409);
    const browse = await request(app).get('/api/chat/channels').set(auth(b));
    expect(browse.body.channels[0]).toMatchObject({ name: 'general', joined: false });
    await request(app).post(`/api/chat/conversations/${ch._id}/join`).set(auth(b));
    expect((await send(b, ch._id, { text: 'hi all' })).status).toBe(201);
  });

  it('mutes / stars per person, and only the creator removes others', async () => {
    const conv = await group();
    const muted = await request(app).post(`/api/chat/conversations/${conv._id}/mute`).set(auth(b)).send({ on: true });
    expect(muted.body.conversation.muted).toBe(true);
    const starred = await request(app).post(`/api/chat/conversations/${conv._id}/star`).set(auth(b)).send({ on: true });
    expect(starred.body.conversation.starred).toBe(true);
    const listA = await request(app).get('/api/chat/conversations').set(auth(a));
    expect(listA.body.conversations[0].muted).toBe(false);

    expect((await request(app).delete(`/api/chat/conversations/${conv._id}/members/${c.user._id}`).set(auth(b))).status).toBe(403);
    expect((await request(app).delete(`/api/chat/conversations/${conv._id}/members/${b.user._id}`).set(auth(b))).status).toBe(200);
    expect((await send(b, conv._id, { text: 'still here?' })).status).toBe(404);
  });
});
