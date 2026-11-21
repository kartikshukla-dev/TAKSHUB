require('dotenv').config();
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test_secret';

const request = require('supertest');
const { startTestDb, stopTestDb, clearTestDb } = require('./setupTestDb');
const createApp = require('../src/app');
const { createUser } = require('./helpers');
const { resetBucket } = require('../src/services/gridfsService');

let app;
let a;
let b;
let c;
const auth = (u) => ({ Authorization: `Bearer ${u.token}` });
// 1x1 transparent PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

beforeAll(async () => {
  delete process.env.GIPHY_API_KEY;
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

async function dm(from, to) {
  const res = await request(app).post('/api/chat/conversations').set(auth(from)).send({ type: 'direct', userId: String(to.user._id) });
  return res.body.conversation;
}
const send = (u, convId, body) => request(app).post(`/api/chat/conversations/${convId}/messages`).set(auth(u)).send(body);
const upload = (u, name, global = false) =>
  request(app).post('/api/chat/stickers').set(auth(u)).field('name', name).field('global', String(global)).attach('image', PNG, { filename: 'x.png', contentType: 'image/png' });

describe('stickers', () => {
  it('lists the office pack, empty recent/saved and no GIPHY without a key', async () => {
    const res = await request(app).get('/api/chat/stickers').set(auth(a));
    expect(res.status).toBe(200);
    expect(res.body.office.length).toBeGreaterThanOrEqual(20);
    expect(res.body.office[0]).toMatchObject({ source: 'office', ref: 'done' });
    expect(res.body.recent).toEqual([]);
    expect(res.body.saved).toEqual([]);
    // GIF search is always on now: with no keys it falls back to Imgflip / Openverse.
    expect(res.body.giphy).toBe(true);
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (url) => ({
      ok: url.includes('imgflip'),
      status: url.includes('imgflip') ? 200 : 503,
      json: async () => ({ success: true, data: { memes: [{ id: '9', name: 'Cat meme', url: 'https://i.imgflip.com/cat.jpg', width: 500, height: 500 }] } }),
    }));
    try {
      const g = await request(app).get('/api/chat/giphy/gifs?q=cat').set(auth(a));
      expect(g.body).toMatchObject({ enabled: true, provider: 'imgflip' });
      expect(g.body.items[0].url).toBe('https://i.imgflip.com/cat.jpg');
    } finally {
      global.fetch = realFetch;
    }
  });

  it('sends an office sticker without text and records it as recent', async () => {
    const conv = await dm(a, b);
    const res = await send(a, conv._id, { media: { type: 'sticker', source: 'office', ref: 'lgtm' } });
    expect(res.status).toBe(201);
    expect(res.body.message.media).toMatchObject({ source: 'office', ref: 'lgtm', url: '/stickers/office/lgtm.svg' });
    await send(a, conv._id, { media: { type: 'sticker', source: 'office', ref: 'done' } });
    await send(a, conv._id, { media: { type: 'sticker', source: 'office', ref: 'lgtm' } });
    const list = await request(app).get('/api/chat/stickers').set(auth(a));
    expect(list.body.recent.map((s) => s.ref)).toEqual(['lgtm', 'done']);
    const convs = await request(app).get('/api/chat/conversations').set(auth(b));
    expect(convs.body.conversations[0].lastMessageText).toBe('Sticker');
  });

  it('rejects unknown stickers and non-GIPHY GIF urls', async () => {
    const conv = await dm(a, b);
    expect((await send(a, conv._id, { media: { type: 'sticker', source: 'office', ref: 'nope' } })).status).toBe(400);
    expect((await send(a, conv._id, { media: { type: 'gif', source: 'giphy', ref: 'x', url: 'https://evil.example/x.gif' } })).status).toBe(400);
    const ok = await send(a, conv._id, { media: { type: 'gif', source: 'giphy', ref: 'abc', url: 'https://media2.giphy.com/media/abc/200.gif', width: 200, height: 150 } });
    expect(ok.status).toBe(201);
    expect(ok.body.message.media.type).toBe('gif');
  });

  it('keeps custom stickers private until shared, and only the owner can share', async () => {
    const up = await upload(a, 'Chai time');
    expect(up.status).toBe(201);
    const id = up.body.sticker._id;
    expect(up.body.sticker.global).toBe(false);

    // c has no access: not global and never sent to them.
    expect((await request(app).get(`/api/chat/stickers/${id}/image`).set(auth(c))).status).toBe(404);
    const convAc = await dm(c, b);
    expect((await send(c, convAc._id, { media: { type: 'sticker', source: 'custom', ref: id } })).status).toBe(404);

    // Sent to b: b can see it and save it, then reuse it.
    const conv = await dm(a, b);
    expect((await send(a, conv._id, { media: { type: 'sticker', source: 'custom', ref: id } })).status).toBe(201);
    expect((await request(app).get(`/api/chat/stickers/${id}/image`).set(auth(b))).status).toBe(200);
    const saved = await request(app).post('/api/chat/stickers/saved').set(auth(b)).send({ source: 'custom', ref: id });
    expect(saved.body.on).toBe(true);
    expect(saved.body.saved[0]).toMatchObject({ source: 'custom', ref: id });

    expect((await request(app).patch(`/api/chat/stickers/${id}`).set(auth(b)).send({ global: true })).status).toBe(403);
    expect((await request(app).patch(`/api/chat/stickers/${id}`).set(auth(a)).send({ global: true })).body.sticker.global).toBe(true);
    const listC = await request(app).get('/api/chat/stickers').set(auth(c));
    expect(listC.body.office.some((s) => s.ref === id)).toBe(true);
    expect((await request(app).get(`/api/chat/stickers/${id}/image`).set(auth(c))).status).toBe(200);

    // Unsave toggles off.
    const unsaved = await request(app).post('/api/chat/stickers/saved').set(auth(b)).send({ source: 'custom', ref: id });
    expect(unsaved.body.saved).toEqual([]);
  });

  it('rejects SVG and oversized sticker images', async () => {
    const svg = await request(app)
      .post('/api/chat/stickers')
      .set(auth(a))
      .field('name', 'x')
      .attach('image', Buffer.from('<svg/>'), { filename: 'x.svg', contentType: 'image/svg+xml' });
    expect(svg.status).toBe(400);
    const big = await request(app)
      .post('/api/chat/stickers')
      .set(auth(a))
      .field('name', 'x')
      .attach('image', Buffer.alloc(1024 * 1024 + 10), { filename: 'x.png', contentType: 'image/png' });
    expect(big.status).toBe(400);
    expect(big.body.message).toMatch(/1 MB/);
  });

  it('lets only the owner delete a sticker', async () => {
    const id = (await upload(a, 'Mine')).body.sticker._id;
    expect((await request(app).delete(`/api/chat/stickers/${id}`).set(auth(b))).status).toBe(403);
    expect((await request(app).delete(`/api/chat/stickers/${id}`).set(auth(a))).status).toBe(200);
    expect((await request(app).get(`/api/chat/stickers/${id}/image`).set(auth(a))).status).toBe(404);
  });
});
