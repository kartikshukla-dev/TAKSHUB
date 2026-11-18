const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Sticker = require('../models/Sticker');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const gridfs = require('../services/gridfsService');
const { OFFICE_STICKERS, OFFICE_KEYS } = require('../constants/officeStickers');

const SAVED_MAX = 100;
const RECENT_MAX = 30;
const STICKER_MAX_BYTES = 1024 * 1024;
// SVG is not allowed: it can carry scripts.
const STICKER_TYPES = /^image\/(png|jpe?g|gif|webp)$/i;
const GIPHY_HOST = /^(media\d*|i)\.giphy\.com$/i;

const idStr = (v) => (v ? String(v._id || v) : null);
const validId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));
const customUrl = (id) => `/chat/stickers/${id}/image`;

function presentCustom(sticker, user) {
  return {
    _id: sticker._id,
    source: 'custom',
    ref: String(sticker._id),
    url: customUrl(sticker._id),
    title: sticker.name,
    global: sticker.global,
    owner: idStr(sticker.owner),
    ownerName: sticker.ownerName,
    mine: idStr(sticker.owner) === idStr(user._id),
    createdAt: sticker.createdAt,
  };
}

const presentOffice = (s) => ({ source: 'office', ref: s.key, url: s.url, title: s.title, emoji: s.emoji });

const refOf = (s) => ({
  source: s.source,
  ref: s.ref,
  url: s.url,
  title: s.title || '',
  width: s.width || null,
  height: s.height || null,
});

const sameRef = (a, b) => a.source === b.source && String(a.ref) === String(b.ref);

// Someone can see / send a custom sticker when it is theirs, shared with
// everyone, saved by them, or already sent in one of their conversations.
async function canUseCustom(user, sticker) {
  if (!sticker) return false;
  if (sticker.global || idStr(sticker.owner) === idStr(user._id) || user.role === 'admin') return true;
  if ((user.savedStickers || []).some((s) => s.source === 'custom' && s.ref === String(sticker._id))) return true;
  const mine = (await Conversation.find({ members: user._id }).select('_id')).map((c) => c._id);
  return Boolean(
    await Message.exists({ conversation: { $in: mine }, 'media.source': 'custom', 'media.ref': String(sticker._id) })
  );
}

function isGiphyUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && GIPHY_HOST.test(u.hostname);
  } catch {
    return false;
  }
}

// Checks a sticker / GIF coming from the client and returns the clean value
// stored on the message (or in Saved / Recent). Throws ApiError when invalid.
async function resolveMedia(user, input) {
  if (!input || typeof input !== 'object') throw new ApiError(400, 'Invalid sticker');
  const type = input.type === 'gif' ? 'gif' : 'sticker';
  const source = String(input.source || '');
  const ref = String(input.ref || '').slice(0, 100);
  if (!ref) throw new ApiError(400, 'Invalid sticker');

  if (source === 'office') {
    if (type !== 'sticker' || !OFFICE_KEYS.has(ref)) throw new ApiError(400, 'Unknown sticker');
    const s = OFFICE_STICKERS.find((x) => x.key === ref);
    return { type, source, ref, url: s.url, title: s.title, width: null, height: null };
  }
  if (source === 'custom') {
    if (type !== 'sticker' || !validId(ref)) throw new ApiError(400, 'Unknown sticker');
    const sticker = await Sticker.findById(ref);
    if (!(await canUseCustom(user, sticker))) throw new ApiError(404, 'Sticker not found');
    return { type, source, ref, url: customUrl(sticker._id), title: sticker.name, width: null, height: null };
  }
  if (source === 'giphy') {
    if (!isGiphyUrl(input.url)) throw new ApiError(400, 'Invalid GIF');
    const num = (v) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Math.min(Math.round(Number(v)), 2000) : null);
    return {
      type,
      source,
      ref: ref.replace(/[^\w-]/g, '').slice(0, 60) || 'gif',
      url: String(input.url).slice(0, 500),
      title: String(input.title || '').slice(0, 200),
      width: num(input.width),
      height: num(input.height),
    };
  }
  throw new ApiError(400, 'Invalid sticker');
}

// Puts a sticker at the top of my "Recent" list (deduplicated, capped).
async function pushRecent(user, media) {
  if (!media || media.type !== 'sticker') return;
  const ref = refOf(media);
  const rest = (user.recentStickers || []).filter((s) => !sameRef(s, ref));
  user.recentStickers = [ref, ...rest].slice(0, RECENT_MAX);
  await user.save();
}

// ---------- endpoints ----------

// GET /api/chat/stickers : everything the sticker panel needs.
const listStickers = catchAsync(async (req, res) => {
  const [globals, mine] = await Promise.all([
    Sticker.find({ global: true }).sort({ createdAt: -1 }).limit(500),
    Sticker.find({ owner: req.user._id, global: false }).sort({ createdAt: -1 }).limit(500),
  ]);
  res.status(200).json({
    office: [...OFFICE_STICKERS.map(presentOffice), ...globals.map((s) => presentCustom(s, req.user))],
    mine: [...globals.filter((s) => idStr(s.owner) === idStr(req.user._id)), ...mine].map((s) => presentCustom(s, req.user)),
    saved: (req.user.savedStickers || []).map(refOf),
    recent: (req.user.recentStickers || []).map(refOf),
    giphy: Boolean(process.env.GIPHY_API_KEY),
  });
});

// POST /api/chat/stickers (multipart: image, name, global?)
const uploadSticker = catchAsync(async (req, res) => {
  const file = req.file;
  if (!file) throw new ApiError(400, 'Pick an image');
  if (!STICKER_TYPES.test(file.mimetype)) throw new ApiError(400, 'Stickers must be PNG, JPG, GIF or WebP');
  if (file.size > STICKER_MAX_BYTES) throw new ApiError(400, 'Sticker image must be 1 MB or smaller');
  const name = String(req.body.name || file.originalname || 'Sticker').replace(/\.[a-z0-9]+$/i, '').trim().slice(0, 60) || 'Sticker';
  const fileId = await gridfs.uploadBuffer({ buffer: file.buffer, filename: `sticker-${name}`, contentType: file.mimetype });
  const sticker = await Sticker.create({
    name,
    owner: req.user._id,
    ownerName: req.user.name,
    global: req.body.global === true || req.body.global === 'true',
    fileId,
    contentType: file.mimetype,
    size: file.size,
  });
  res.status(201).json({ sticker: presentCustom(sticker, req.user) });
});

async function loadOwnSticker(req) {
  if (!validId(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const sticker = await Sticker.findById(req.params.id);
  if (!sticker) throw new ApiError(404, 'Sticker not found');
  if (idStr(sticker.owner) !== idStr(req.user._id) && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only the person who made this sticker can change it');
  }
  return sticker;
}

// PATCH /api/chat/stickers/:id { name?, global? } : owner or Super Admin.
const updateSticker = catchAsync(async (req, res) => {
  const sticker = await loadOwnSticker(req);
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim().slice(0, 60);
    if (!name) throw new ApiError(400, 'Name cannot be empty');
    sticker.name = name;
  }
  if (req.body.global !== undefined) sticker.global = Boolean(req.body.global);
  await sticker.save();
  res.status(200).json({ sticker: presentCustom(sticker, req.user) });
});

// DELETE /api/chat/stickers/:id : owner or Super Admin.
const deleteSticker = catchAsync(async (req, res) => {
  const sticker = await loadOwnSticker(req);
  await gridfs.deleteFile(sticker.fileId).catch(() => {});
  await sticker.deleteOne();
  res.status(200).json({ ok: true });
});

// GET /api/chat/stickers/:id/image
const stickerImage = catchAsync(async (req, res) => {
  if (!validId(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const sticker = await Sticker.findById(req.params.id);
  if (!(await canUseCustom(req.user, sticker))) throw new ApiError(404, 'Sticker not found');
  res.setHeader('Content-Type', sticker.contentType);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  gridfs
    .downloadStream(sticker.fileId)
    .on('error', () => !res.headersSent && res.status(404).end())
    .pipe(res);
});

// POST /api/chat/stickers/saved { source, ref, url?, title?, width?, height? } : toggles.
const toggleSaved = catchAsync(async (req, res) => {
  const media = await resolveMedia(req.user, { ...req.body, type: 'sticker' });
  const ref = refOf(media);
  const list = req.user.savedStickers || [];
  const exists = list.some((s) => sameRef(s, ref));
  const on = req.body.on === undefined ? !exists : Boolean(req.body.on);
  const rest = list.filter((s) => !sameRef(s, ref));
  if (on && rest.length >= SAVED_MAX) throw new ApiError(400, `You can save up to ${SAVED_MAX} stickers`);
  req.user.savedStickers = on ? [ref, ...rest] : rest;
  await req.user.save();
  res.status(200).json({ saved: req.user.savedStickers.map(refOf), on });
});

// DELETE /api/chat/stickers/recent : clears my Recent list.
const clearRecent = catchAsync(async (req, res) => {
  req.user.recentStickers = [];
  await req.user.save();
  res.status(200).json({ recent: [] });
});

// GET /api/chat/giphy/:kind?q=&offset= (kind = gifs | stickers)
// Proxied so the GIPHY key stays on the server.
const giphySearch = catchAsync(async (req, res) => {
  const key = process.env.GIPHY_API_KEY;
  if (!key) return res.status(200).json({ enabled: false, items: [], next: null });
  const kind = req.params.kind === 'stickers' ? 'stickers' : 'gifs';
  const q = String(req.query.q || '').trim().slice(0, 50);
  const offset = Math.max(0, Math.min(Number(req.query.offset) || 0, 4999));
  const limit = 24;
  const params = new URLSearchParams({ api_key: key, limit: String(limit), offset: String(offset), rating: 'g', bundle: 'messaging_non_clips' });
  if (q) params.set('q', q);
  const url = `https://api.giphy.com/v1/${kind}/${q ? 'search' : 'trending'}?${params}`;

  let body;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error(`GIPHY ${r.status}`);
    body = await r.json();
  } catch (err) {
    throw new ApiError(502, 'GIF search is not available right now');
  }
  const items = (body.data || [])
    .map((g) => {
      const full = (g.images && (g.images.fixed_height || g.images.original)) || {};
      const small = (g.images && (g.images.fixed_height_small || g.images.fixed_width_small)) || full;
      if (!isGiphyUrl(full.url)) return null;
      return {
        type: kind === 'stickers' ? 'sticker' : 'gif',
        source: 'giphy',
        ref: String(g.id),
        title: String(g.title || '').slice(0, 200),
        url: full.url,
        preview: isGiphyUrl(small.url) ? small.url : full.url,
        width: Number(full.width) || null,
        height: Number(full.height) || null,
      };
    })
    .filter(Boolean);
  const total = body.pagination ? body.pagination.total_count : 0;
  const nextOffset = offset + items.length;
  return res.status(200).json({ enabled: true, items, next: items.length && nextOffset < total ? nextOffset : null });
});

module.exports = {
  resolveMedia,
  pushRecent,
  listStickers,
  uploadSticker,
  updateSticker,
  deleteSticker,
  stickerImage,
  toggleSaved,
  clearRecent,
  giphySearch,
  STICKER_MAX_BYTES,
};
