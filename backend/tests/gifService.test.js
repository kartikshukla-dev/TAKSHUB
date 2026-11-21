// GIF search fallback chain with fetch mocked (no network).
const gifs = require('../src/services/gifService');

const giphyBody = (n = 3) => ({
  data: Array.from({ length: n }, (_, i) => ({
    id: `g${i}`,
    title: `giphy ${i}`,
    images: { fixed_height: { url: `https://media1.giphy.com/media/g${i}/200.gif`, width: '200', height: '150' } },
  })),
  pagination: { total_count: 100 },
});
const klipyBody = () => ({
  result: true,
  data: {
    data: [
      { id: 1, slug: 'k-1', title: 'klipy 1', type: 'gif', file: { md: { gif: { url: 'https://static.klipy.com/ii/a/b.gif', width: 220, height: 160 } } } },
      { id: 2, slug: 'ad', type: 'ad', file: {} },
    ],
    has_next: true,
  },
});
const openverseBody = () => ({ results: [{ id: 'o1', title: 'dance', creator: 'X', license: 'cc0', url: 'https://upload.wikimedia.org/a.gif', width: 300, height: 200 }, { id: 'o2', url: 'https://evil.example/x.gif' }], page_count: 3 });
const imgflipBody = () => ({ success: true, data: { memes: [{ id: '1', name: 'Drake Hotline Bling', url: 'https://i.imgflip.com/30b1gx.jpg', width: 1200, height: 1200 }, { id: '2', name: 'Distracted Boyfriend', url: 'https://i.imgflip.com/1ur9b0.jpg', width: 1200, height: 800 }] } });

const res = (status, body) => ({ ok: status < 400, status, json: async () => body });
let calls;

function mockFetch(handlers) {
  calls = [];
  global.fetch = jest.fn(async (url) => {
    calls.push(url);
    const host = new URL(url).hostname;
    const h = handlers[host];
    return h ? h(url) : res(500, {});
  });
}

beforeEach(() => {
  gifs.resetForTests();
  process.env.GIPHY_API_KEY = 'key1,key2';
  process.env.KLIPY_API_KEY = 'kk';
});
afterAll(() => {
  delete process.env.GIPHY_API_KEY;
  delete process.env.KLIPY_API_KEY;
});

describe('GIF search fallback', () => {
  it('uses GIPHY and caches the answer', async () => {
    mockFetch({ 'api.giphy.com': () => res(200, giphyBody()) });
    const a = await gifs.search({ kind: 'gifs', q: 'Cat' });
    expect(a).toMatchObject({ provider: 'giphy', label: 'GIPHY', next: 'giphy:2' });
    expect(a.items).toHaveLength(3);
    await gifs.search({ kind: 'gifs', q: 'cat' });
    expect(calls).toHaveLength(1);
  });

  it('rotates to the second GIPHY key, then to KLIPY when GIPHY is out', async () => {
    let giphyHits = 0;
    mockFetch({
      'api.giphy.com': (url) => {
        giphyHits += 1;
        return url.includes('key2') ? res(200, giphyBody(2)) : res(429, {});
      },
    });
    expect((await gifs.search({ kind: 'gifs', q: 'dog' })).provider).toBe('giphy');
    expect(giphyHits).toBe(2);

    gifs.resetForTests();
    mockFetch({ 'api.giphy.com': () => res(429, {}), 'api.klipy.com': () => res(200, klipyBody()) });
    const k = await gifs.search({ kind: 'gifs', q: 'dog', user: 'u1' });
    expect(k.provider).toBe('klipy');
    expect(k.items).toHaveLength(1); // the ad is dropped
    expect(k.items[0].url).toBe('https://static.klipy.com/ii/a/b.gif');
    // Paused keys are skipped on the next search (no more GIPHY calls).
    const before = calls.filter((u) => u.includes('giphy')).length;
    await gifs.search({ kind: 'gifs', q: 'party' });
    expect(calls.filter((u) => u.includes('giphy')).length).toBe(before);
  });

  it('falls back to Imgflip memes with no keys, and says search is limited', async () => {
    delete process.env.GIPHY_API_KEY;
    delete process.env.KLIPY_API_KEY;
    mockFetch({ 'api.imgflip.com': () => res(200, imgflipBody()), 'api.openverse.org': () => res(200, openverseBody()) });
    const m = await gifs.search({ kind: 'gifs', q: 'drake' });
    expect(m).toMatchObject({ provider: 'imgflip', limited: true });
    expect(m.items[0].title).toMatch(/Drake/);
    // Openverse is off by default.
    expect(await gifs.search({ kind: 'gifs', q: 'dance' })).toMatchObject({ items: [], provider: null });
    expect(calls.some((u) => u.includes('openverse'))).toBe(false);
  });

  it('uses Openverse only when switched on, and drops images from other hosts', async () => {
    delete process.env.GIPHY_API_KEY;
    delete process.env.KLIPY_API_KEY;
    process.env.OPENVERSE_ENABLED = 'true';
    try {
      mockFetch({ 'api.imgflip.com': () => res(200, imgflipBody()), 'api.openverse.org': () => res(200, openverseBody()) });
      const o = await gifs.search({ kind: 'gifs', q: 'dance' });
      expect(o.provider).toBe('openverse');
      expect(o.items.map((i) => i.url)).toEqual(['https://upload.wikimedia.org/a.gif']);
    } finally {
      delete process.env.OPENVERSE_ENABLED;
    }
  });

  it('stickers never fall back to non-sticker sources, and Load more stays on the same provider', async () => {
    delete process.env.GIPHY_API_KEY;
    delete process.env.KLIPY_API_KEY;
    mockFetch({});
    expect(await gifs.search({ kind: 'stickers', q: 'hi' })).toMatchObject({ items: [], provider: null });

    process.env.GIPHY_API_KEY = 'key1';
    mockFetch({ 'api.giphy.com': () => res(200, giphyBody()) });
    await gifs.search({ kind: 'gifs', q: 'x', cursor: 'giphy:3' });
    expect(calls[0]).toContain('offset=48');
  });

  it('only accepts images from each provider’s own hosts', () => {
    expect(gifs.hostOk('klipy', 'https://static2.klipy.com/a.gif')).toBe(true);
    expect(gifs.hostOk('klipy', 'https://media.giphy.com/a.gif')).toBe(false);
    expect(gifs.hostOk('imgflip', 'http://i.imgflip.com/a.jpg')).toBe(false);
    expect(gifs.hostOk('openverse', 'https://upload.wikimedia.org/x.gif')).toBe(true);
  });
});
