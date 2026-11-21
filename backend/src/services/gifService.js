// GIF / sticker / meme search with several providers and a shared cache,
// so the picker keeps working when one provider's free limit runs out.
//
// Order (first one that answers wins; a provider that hits its limit is
// skipped until it resets):
//   1. GIPHY    - GIPHY_API_KEY   (one or more keys, comma separated)
//   2. KLIPY    - KLIPY_API_KEY   (one or more keys, comma separated)
//   3. Imgflip  - no key. The 100 most popular meme templates (still images).
//   4. Openverse - open source (WordPress), no key, CC GIFs. Off by default
//      (OPENVERSE_ENABLED=true): random uploads, not office-safe enough.
// Imgflip needs no key, so the picker always shows something.
//
// Every answer is cached in memory (search 6 h, trending 30 min), so the same
// search by anyone in the office costs one call per 6 hours.
const crypto = require('crypto');

const PER_PAGE = 24;
const SEARCH_TTL = 6 * 3600 * 1000;
const TRENDING_TTL = 30 * 60 * 1000;
const CACHE_MAX = 1000;
const TIMEOUT_MS = 8000;

// Hosts each provider's images may come from (checked again when a GIF is sent).
const HOSTS = {
  giphy: /^(media\d*|i)\.giphy\.com$/i,
  klipy: /^static\d*\.klipy\.com$/i,
  openverse: /^(upload\.wikimedia\.org|live\.staticflickr\.com|farm\d+\.staticflickr\.com)$/i,
  imgflip: /^i\.imgflip\.com$/i,
};
const LABELS = { giphy: 'GIPHY', klipy: 'KLIPY', openverse: 'Openverse', imgflip: 'Imgflip' };
const SOURCES = Object.keys(HOSTS);

function hostOk(source, url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && Boolean(HOSTS[source]) && HOSTS[source].test(u.hostname);
  } catch {
    return false;
  }
}

const keysOf = (name) =>
  String(process.env[name] || '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);

// ---------- cool-down per key (rate limited / rejected) ----------
const coolUntil = new Map(); // `${provider}:${key}` -> ms
const cooled = (id) => (coolUntil.get(id) || 0) > Date.now();
function cool(id, status) {
  // 429 = limit hit (GIPHY / KLIPY test keys reset hourly); 401/403 = bad key.
  const ms = status === 429 ? 60 * 60 * 1000 : status === 401 || status === 403 ? 6 * 3600 * 1000 : 2 * 60 * 1000;
  coolUntil.set(id, Date.now() + ms);
  console.warn(`[gifs] ${id.split(':')[0]} paused for ${Math.round(ms / 60000)} min (HTTP ${status || 'error'})`);
}

class ProviderError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': 'TasksManager/1.0 (Oncare)', ...headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!r.ok) throw new ProviderError(r.status, `HTTP ${r.status}`);
  return r.json();
}

const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.round(Number(v)) : null);
const item = (source, type, { ref, title, url, preview, width, height }) =>
  hostOk(source, url)
    ? { type, source, ref: String(ref).replace(/[^\w-]/g, '').slice(0, 60) || 'gif', title: String(title || '').slice(0, 200), url, preview: hostOk(source, preview) ? preview : url, width: num(width), height: num(height) }
    : null;

// ---------- providers ----------
// Each: available() -> bool; search({ kind, q, page, user }) -> { items, hasNext }

const giphy = {
  id: 'giphy',
  kinds: ['gifs', 'stickers'],
  keys: () => keysOf('GIPHY_API_KEY'),
  async search({ kind, q, page }, key) {
    const params = new URLSearchParams({ api_key: key, limit: String(PER_PAGE), offset: String((page - 1) * PER_PAGE), rating: 'g', bundle: 'messaging_non_clips' });
    if (q) params.set('q', q);
    const body = await getJson(`https://api.giphy.com/v1/${kind}/${q ? 'search' : 'trending'}?${params}`);
    const type = kind === 'stickers' ? 'sticker' : 'gif';
    const items = (body.data || [])
      .map((g) => {
        const full = (g.images && (g.images.fixed_height || g.images.original)) || {};
        const small = (g.images && (g.images.fixed_height_small || g.images.fixed_width_small)) || full;
        return item('giphy', type, { ref: g.id, title: g.title, url: full.url, preview: small.url, width: full.width, height: full.height });
      })
      .filter(Boolean);
    const total = body.pagination ? body.pagination.total_count : 0;
    return { items, hasNext: page * PER_PAGE < Math.min(total, 4999) };
  },
};

const klipy = {
  id: 'klipy',
  kinds: ['gifs', 'stickers'],
  keys: () => keysOf('KLIPY_API_KEY'),
  async search({ kind, q, page, user }, key) {
    const params = new URLSearchParams({ page: String(page), per_page: String(PER_PAGE), content_filter: 'medium' });
    if (q) params.set('q', q);
    // Anonymous, stable id per person (KLIPY uses it for personalisation only).
    if (user) params.set('customer_id', crypto.createHash('sha256').update(`tm:${user}`).digest('hex').slice(0, 32));
    const body = await getJson(`https://api.klipy.com/api/v1/${encodeURIComponent(key)}/${kind}/${q ? 'search' : 'trending'}?${params}`);
    const data = (body && body.data) || {};
    const type = kind === 'stickers' ? 'sticker' : 'gif';
    const pick = (file, size) => (file && file[size] && (file[size].gif || file[size].webp)) || null;
    const items = (data.data || [])
      .filter((g) => g && g.type !== 'ad' && g.file)
      .map((g) => {
        const full = pick(g.file, 'md') || pick(g.file, 'hd') || pick(g.file, 'sm') || {};
        const small = pick(g.file, 'sm') || pick(g.file, 'xs') || full;
        return item('klipy', type, { ref: g.slug || g.id, title: g.title, url: full.url, preview: small.url, width: full.width, height: full.height });
      })
      .filter(Boolean);
    return { items, hasNext: Boolean(data.has_next) };
  },
};

// Open source, run by WordPress. Anonymous: about 1 request / second and
// 200 a day, so the cache matters. Few "reaction" GIFs, but never needs a key.
// Off unless OPENVERSE_ENABLED=true: its GIFs are random Creative Commons
// uploads (not reaction GIFs) and its "mature" filter misses things, so it
// isn't a good default for an office chat.
const openverse = {
  id: 'openverse',
  kinds: ['gifs'],
  keys: () => (process.env.OPENVERSE_ENABLED === 'true' ? ['public'] : []),
  async search({ q, page }) {
    const params = new URLSearchParams({ q: q || 'funny', extension: 'gif', page_size: '20', page: String(page), mature: 'false' });
    const body = await getJson(`https://api.openverse.org/v1/images/?${params}`);
    const items = (body.results || [])
      .map((g) =>
        item('openverse', 'gif', {
          ref: g.id,
          title: [g.title, g.creator && `by ${g.creator}`, g.license && `(${String(g.license).toUpperCase()})`].filter(Boolean).join(' '),
          url: g.url,
          preview: g.url,
          width: g.width,
          height: g.height,
        })
      )
      .filter(Boolean);
    return { items, hasNext: page < Math.min(body.page_count || 1, 12) };
  },
};

// The 100 most used meme templates. One call a day; searched locally.
let imgflipList = null;
const imgflip = {
  id: 'imgflip',
  kinds: ['gifs'],
  keys: () => ['public'],
  async search({ q, page }) {
    if (!imgflipList || imgflipList.at < Date.now() - 24 * 3600 * 1000) {
      const body = await getJson('https://api.imgflip.com/get_memes');
      if (!body.success) throw new ProviderError(502, 'Imgflip error');
      imgflipList = { at: Date.now(), memes: body.data.memes || [] };
    }
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const all = imgflipList.memes.filter((m) => words.every((w) => String(m.name).toLowerCase().includes(w)));
    const slice = all.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    return {
      items: slice.map((m) => item('imgflip', 'gif', { ref: m.id, title: `${m.name} (meme)`, url: m.url, preview: m.url, width: m.width, height: m.height })).filter(Boolean),
      hasNext: page * PER_PAGE < all.length,
    };
  },
};

const PROVIDERS = [giphy, klipy, imgflip, openverse];

// True when no keyed provider (GIPHY / KLIPY) can answer right now, so the
// picker can say search is limited to meme templates.
const limitedNow = () =>
  [giphy, klipy].every((p) => {
    const keys = p.keys();
    return !keys.length || keys.every((k) => cooled(`${p.id}:${k}`));
  });

// ---------- cache ----------
const cache = new Map(); // key -> { at, ttl, value }
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > hit.ttl) {
    cache.delete(key);
    return null;
  }
  cache.delete(key); // keep most-recent last
  cache.set(key, hit);
  return hit.value;
}
function cacheSet(key, value, ttl) {
  cache.set(key, { at: Date.now(), ttl, value });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}

// Runs one provider, rotating through its keys; null when none could answer.
async function tryProvider(p, args) {
  for (const key of p.keys()) {
    const id = `${p.id}:${key}`;
    if (cooled(id)) continue;
    try {
      // eslint-disable-next-line no-await-in-loop
      return await p.search(args, key);
    } catch (err) {
      cool(id, err.status);
    }
  }
  return null;
}

/**
 * kind: 'gifs' | 'stickers'; q: search text ('' = trending);
 * cursor: from a previous answer's `next` ("provider:page"), for Load more.
 * Returns { items, next, provider, label }.
 */
async function search({ kind, q = '', cursor = null, user = null }) {
  kind = kind === 'stickers' ? 'stickers' : 'gifs';
  q = String(q || '').trim().toLowerCase().slice(0, 50);
  let only = null;
  let page = 1;
  if (cursor) {
    const [p, n] = String(cursor).split(':');
    if (SOURCES.includes(p)) only = p;
    page = Math.max(1, Math.min(Number(n) || 1, 200));
  }
  const cacheKey = `${kind}|${q}|${only || '*'}|${page}`;
  const hit = cacheGet(cacheKey);
  if (hit) return { ...hit, limited: limitedNow() };

  const list = PROVIDERS.filter((p) => p.kinds.includes(kind) && (!only || p.id === only));
  for (const p of list) {
    // eslint-disable-next-line no-await-in-loop
    const res = await tryProvider(p, { kind, q, page, user });
    // Nothing found here: let the next provider try (except on Load more).
    if (!res || (!res.items.length && !only)) continue;
    const value = { items: res.items, next: res.hasNext && res.items.length ? `${p.id}:${page + 1}` : null, provider: p.id, label: LABELS[p.id] };
    cacheSet(cacheKey, value, q ? SEARCH_TTL : TRENDING_TTL);
    return { ...value, limited: limitedNow() };
  }
  return { items: [], next: null, provider: null, label: null, limited: limitedNow() };
}

// Which providers are configured / currently usable (for the admin page and logs).
function status() {
  return PROVIDERS.map((p) => {
    const keys = p.keys();
    return { id: p.id, label: LABELS[p.id], keys: keys[0] === 'public' ? 'none needed' : keys.length, paused: keys.length > 0 && keys.every((k) => cooled(`${p.id}:${k}`)) };
  });
}

function resetForTests() {
  cache.clear();
  coolUntil.clear();
  imgflipList = null;
}

module.exports = { search, status, hostOk, SOURCES, LABELS, resetForTests, PER_PAGE };
