const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const gridfs = require('../services/gridfsService');
const { emitToUsers, getPresence } = require('../services/socketService');
const { notify } = require('../services/notificationService');
const { resolveMedia, pushRecent } = require('./stickerController');

const MEMBER_FIELDS = 'name email avatar jobTitle';
const NAMED = ['group', 'channel'];

const idStr = (v) => (v ? String(v._id || v) : null);
const has = (list, id) => (list || []).some((x) => idStr(x) === idStr(id));
const validId = (id) => mongoose.Types.ObjectId.isValid(String(id || ''));

function isMember(conversation, userId) {
  return has(conversation.members, userId);
}

// Membership is the only access rule: admins can't read chats they're not in.
async function loadConversation(req, id = req.params.id) {
  if (!validId(id)) throw new ApiError(400, 'Invalid id format');
  const conversation = await Conversation.findById(id);
  if (!conversation || !isMember(conversation, req.user._id)) throw new ApiError(404, 'Conversation not found');
  return conversation;
}

// A message plus its conversation, after checking the caller is a member.
async function loadMessage(req) {
  if (!validId(req.params.mid)) throw new ApiError(400, 'Invalid id format');
  const message = await Message.findById(req.params.mid);
  if (!message) throw new ApiError(404, 'Message not found');
  const conversation = await loadConversation(req, message.conversation);
  return { message, conversation };
}

async function unreadCount(conversation, userId) {
  const read = conversation.reads.find((r) => idStr(r.user) === idStr(userId));
  const filter = { conversation: conversation._id, sender: { $ne: userId }, parent: null, deletedAt: null };
  if (read) filter.createdAt = { $gt: read.at };
  return Message.countDocuments(filter);
}

async function present(conversation, userId) {
  await conversation.populate('members', MEMBER_FIELDS);
  const json = conversation.toObject();
  json.reads = (json.reads || []).map((r) => ({ user: idStr(r.user), at: r.at }));
  json.muted = has(json.mutedBy, userId);
  json.starred = has(json.starredBy, userId);
  delete json.mutedBy;
  delete json.starredBy;
  return { ...json, unread: await unreadCount(conversation, userId) };
}

// Per-person flags are stripped; `saved` is only filled in for the caller.
function presentMessage(message, userId) {
  const json = typeof message.toObject === 'function' ? message.toObject() : { ...message };
  if (userId) json.saved = has(json.savedBy, userId);
  delete json.savedBy;
  json.reactions = (json.reactions || []).map((r) => ({ emoji: r.emoji, users: r.users.map(idStr) }));
  return json;
}

// Tell every member (old and new) that the conversation itself changed.
async function broadcastConversation(conversation, extraUserIds = []) {
  const ids = [...new Set([...conversation.members.map(idStr), ...extraUserIds.map(idStr)])];
  // Each member gets their own unread / muted / starred view.
  await Promise.all(
    ids.map(async (uid) => {
      const view = isMember(conversation, uid) ? await present(conversation, uid) : { _id: conversation._id, removed: true };
      emitToUsers([uid], 'chat:conversation', view);
    })
  );
}

function broadcastMessageUpdate(conversation, message) {
  emitToUsers(conversation.members, 'chat:message:update', {
    conversationId: conversation._id,
    message: presentMessage(message),
  });
}

function parseMaybeJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function previewOf(message) {
  if (message.text) return message.text.slice(0, 200);
  if (message.snippet) return `Snippet: ${message.snippet.title || message.snippet.language || 'code'}`;
  if (message.media) return message.media.type === 'gif' ? 'GIF' : 'Sticker';
  if (message.files && message.files.length) return `📎 ${message.files[0].filename}`;
  return '';
}

function conversationLabel(conversation, sender) {
  if (conversation.type === 'channel') return `#${conversation.name}`;
  if (conversation.type === 'group') return conversation.name;
  return `a message from ${sender.name}`;
}

// ---------- conversations ----------

const listConversations = catchAsync(async (req, res) => {
  const conversations = await Conversation.find({ members: req.user._id }).sort({ lastMessageAt: -1, updatedAt: -1 });
  const result = await Promise.all(conversations.map((c) => present(c, req.user._id)));
  res.status(200).json({ conversations: result });
});

// GET /api/chat/channels : every public channel, so people can browse and join.
const listChannels = catchAsync(async (req, res) => {
  const channels = await Conversation.find({ type: 'channel' }).select('name description members createdAt').sort('name').lean();
  res.status(200).json({
    channels: channels.map((c) => ({
      _id: c._id,
      name: c.name,
      description: c.description,
      memberCount: c.members.length,
      joined: has(c.members, req.user._id),
    })),
  });
});

async function validMemberIds(me, memberIds) {
  const ids = [...new Set([String(me), ...(Array.isArray(memberIds) ? memberIds.map(String) : [])])].filter(validId);
  const found = await User.countDocuments({ _id: { $in: ids }, status: { $ne: 'disabled' } });
  if (found !== ids.length) throw new ApiError(400, 'Some members were not found');
  return ids;
}

// POST /api/chat/conversations
//   { type: 'direct', userId }                         -> finds or creates the DM
//   { type: 'group', name, memberIds[] }               -> private group incl. the caller
//   { type: 'channel', name, description?, memberIds? } -> public channel
const createConversation = catchAsync(async (req, res) => {
  const { type } = req.body;
  const me = req.user._id;

  if (type === 'direct') {
    const { userId } = req.body;
    if (!userId || !validId(userId)) throw new ApiError(400, 'userId is required');
    if (String(userId) === String(me)) throw new ApiError(400, 'You cannot message yourself');
    const other = await User.findById(userId).select('_id');
    if (!other) throw new ApiError(404, 'User not found');

    let conversation = await Conversation.findOne({ type: 'direct', members: { $all: [me, other._id], $size: 2 } });
    let status = 200;
    if (!conversation) {
      conversation = await Conversation.create({ type: 'direct', members: [me, other._id], createdBy: me });
      status = 201;
    }
    return res.status(status).json({ conversation: await present(conversation, me) });
  }

  if (NAMED.includes(type)) {
    const name = String(req.body.name || '').trim();
    if (!name) throw new ApiError(400, type === 'channel' ? 'Channel name is required' : 'Group name is required');
    if (name.length > 80) throw new ApiError(400, 'Name is too long');
    const ids = await validMemberIds(me, req.body.memberIds);
    if (type === 'group' && ids.length < 2) throw new ApiError(400, 'Pick at least one other person');
    if (type === 'channel') {
      const taken = await Conversation.exists({ type: 'channel', name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
      if (taken) throw new ApiError(409, `A channel called #${name} already exists`);
    }
    const conversation = await Conversation.create({
      type,
      name,
      description: String(req.body.description || '').trim().slice(0, 500),
      members: ids,
      createdBy: me,
    });
    await broadcastConversation(conversation);
    return res.status(201).json({ conversation: await present(conversation, me) });
  }

  throw new ApiError(400, "type must be 'direct', 'group' or 'channel'");
});

// PATCH /api/chat/conversations/:id { name?, description? } (groups and channels)
const updateConversation = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  if (!NAMED.includes(conversation.type)) throw new ApiError(400, 'Direct messages cannot be renamed');
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name) throw new ApiError(400, 'Name cannot be empty');
    if (conversation.type === 'channel' && name.toLowerCase() !== conversation.name.toLowerCase()) {
      const taken = await Conversation.exists({ type: 'channel', name: new RegExp(`^${escapeRegex(name)}$`, 'i') });
      if (taken) throw new ApiError(409, `A channel called #${name} already exists`);
    }
    conversation.name = name.slice(0, 80);
  }
  if (req.body.description !== undefined) conversation.description = String(req.body.description).trim().slice(0, 500);
  await conversation.save();
  await broadcastConversation(conversation);
  res.status(200).json({ conversation: await present(conversation, req.user._id) });
});

// POST /api/chat/conversations/:id/members { userIds[] }
const addMembers = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  if (!NAMED.includes(conversation.type)) throw new ApiError(400, 'People can only be added to groups and channels');
  const ids = await validMemberIds(req.user._id, req.body.userIds);
  ids.forEach((id) => {
    if (!isMember(conversation, id)) conversation.members.push(id);
  });
  await conversation.save();
  await broadcastConversation(conversation);
  res.status(200).json({ conversation: await present(conversation, req.user._id) });
});

// DELETE /api/chat/conversations/:id/members/:userId : leave (self), or
// remove someone (creator of the group/channel, or a Super Admin member).
const removeMember = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  if (!NAMED.includes(conversation.type)) throw new ApiError(400, 'You cannot leave a direct message');
  const target = String(req.params.userId);
  const self = target === String(req.user._id);
  if (!self && idStr(conversation.createdBy) !== String(req.user._id) && req.user.role !== 'admin') {
    throw new ApiError(403, 'Only the person who created it can remove people');
  }
  if (!isMember(conversation, target)) throw new ApiError(404, 'Not a member');
  conversation.members = conversation.members.filter((m) => idStr(m) !== target);
  conversation.reads = conversation.reads.filter((r) => idStr(r.user) !== target);
  await conversation.save();
  await broadcastConversation(conversation, [target]);
  res.status(200).json({ ok: true });
});

// POST /api/chat/conversations/:id/join (public channels only)
const joinChannel = catchAsync(async (req, res) => {
  if (!validId(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation || conversation.type !== 'channel') throw new ApiError(404, 'Channel not found');
  if (!isMember(conversation, req.user._id)) {
    conversation.members.push(req.user._id);
    await conversation.save();
    await broadcastConversation(conversation);
  }
  res.status(200).json({ conversation: await present(conversation, req.user._id) });
});

function togglePref(field) {
  return catchAsync(async (req, res) => {
    const conversation = await loadConversation(req);
    const on = req.body.on === undefined ? !has(conversation[field], req.user._id) : Boolean(req.body.on);
    conversation[field] = conversation[field].filter((u) => idStr(u) !== String(req.user._id));
    if (on) conversation[field].push(req.user._id);
    await conversation.save();
    res.status(200).json({ conversation: await present(conversation, req.user._id) });
  });
}
const muteConversation = togglePref('mutedBy');
const starConversation = togglePref('starredBy');

// ---------- messages ----------

// GET /api/chat/conversations/:id/messages?before=<date>|around=<messageId>&limit=
// Top-level messages only; thread replies come from /messages/:mid/thread.
const listMessages = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const base = { conversation: conversation._id, parent: null };
  let messages;
  let hasMore;

  if (req.query.around && validId(req.query.around)) {
    const target = await Message.findOne({ _id: req.query.around, conversation: conversation._id });
    if (!target) throw new ApiError(404, 'Message not found');
    // A thread reply jumps to its parent.
    const anchor = target.parent ? await Message.findById(target.parent) : target;
    const half = Math.ceil(limit / 2);
    const older = await Message.find({ ...base, createdAt: { $lt: anchor.createdAt } }).sort({ createdAt: -1 }).limit(half + 1).populate('sender', MEMBER_FIELDS);
    const newer = await Message.find({ ...base, createdAt: { $gte: anchor.createdAt } }).sort({ createdAt: 1 }).limit(half).populate('sender', MEMBER_FIELDS);
    hasMore = older.length > half;
    messages = [...older.slice(0, half).reverse(), ...newer];
  } else {
    const filter = { ...base };
    if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };
    const found = await Message.find(filter).sort({ createdAt: -1 }).limit(limit + 1).populate('sender', MEMBER_FIELDS);
    hasMore = found.length > limit;
    messages = found.slice(0, limit).reverse();
  }
  res.status(200).json({ messages: messages.map((m) => presentMessage(m, req.user._id)), hasMore });
});

// GET /api/chat/messages/:mid/thread
const getThread = catchAsync(async (req, res) => {
  const { message } = await loadMessage(req);
  const root = message.parent ? await Message.findById(message.parent) : message;
  await root.populate('sender', MEMBER_FIELDS);
  const replies = await Message.find({ parent: root._id }).sort({ createdAt: 1 }).populate('sender', MEMBER_FIELDS);
  res.status(200).json({
    parent: presentMessage(root, req.user._id),
    replies: replies.map((m) => presentMessage(m, req.user._id)),
  });
});

// POST /api/chat/conversations/:id/messages
// JSON or multipart: text, parent?, snippet? {title, language, code}, mentions? [userId], files (multipart)
const sendMessage = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  const text = String(req.body.text || '').trim();
  const snippetIn = parseMaybeJson(req.body.snippet, null);
  const mentionIds = parseMaybeJson(req.body.mentions, []);
  const uploads = req.files || [];
  const mediaIn = parseMaybeJson(req.body.media, null);

  if (text.length > Message.TEXT_MAX) {
    throw new ApiError(400, `Message is longer than ${Message.TEXT_MAX} characters. Send it as a snippet instead.`);
  }
  let snippet = null;
  if (snippetIn && String(snippetIn.code || '').trim()) {
    const code = String(snippetIn.code).replace(/\s+$/, '');
    if (code.length > Message.SNIPPET_MAX) throw new ApiError(400, `Snippet is longer than ${Message.SNIPPET_MAX} characters`);
    snippet = {
      title: String(snippetIn.title || '').trim().slice(0, 200),
      language: String(snippetIn.language || 'text').trim().slice(0, 40) || 'text',
      code,
    };
  }
  const media = mediaIn ? await resolveMedia(req.user, mediaIn) : null;
  if (!text && !snippet && !media && uploads.length === 0) throw new ApiError(400, 'Message cannot be empty');

  let parent = null;
  if (req.body.parent) {
    if (!validId(req.body.parent)) throw new ApiError(400, 'Invalid thread');
    parent = await Message.findOne({ _id: req.body.parent, conversation: conversation._id });
    if (!parent || parent.deletedAt) throw new ApiError(404, 'Thread not found');
    if (parent.parent) parent = await Message.findById(parent.parent); // replies stay one level deep
  }

  const files = [];
  for (const f of uploads) {
    // eslint-disable-next-line no-await-in-loop
    const fileId = await gridfs.uploadBuffer({ buffer: f.buffer, filename: f.originalname, contentType: f.mimetype });
    files.push({ fileId, filename: f.originalname, contentType: f.mimetype || 'application/octet-stream', size: f.size });
  }

  const memberSet = new Set(conversation.members.map(idStr));
  const mentions = [...new Set((Array.isArray(mentionIds) ? mentionIds : []).map(String))].filter(
    (id) => memberSet.has(id) && id !== String(req.user._id)
  );
  const mentionAll = conversation.type !== 'direct' && /(^|\s)@(channel|here|all)\b/i.test(text);

  const message = await Message.create({
    conversation: conversation._id,
    sender: req.user._id,
    text,
    snippet,
    media,
    files,
    parent: parent ? parent._id : null,
    mentions,
    mentionAll,
  });
  await message.populate('sender', MEMBER_FIELDS);
  if (media) await pushRecent(req.user, media).catch(() => {});

  if (parent) {
    parent.replyCount += 1;
    parent.lastReplyAt = message.createdAt;
    await parent.save();
    await parent.populate('sender', MEMBER_FIELDS);
  } else {
    conversation.lastMessageAt = message.createdAt;
    conversation.lastMessageText = previewOf(message);
    markRead(conversation, req.user._id, message.createdAt);
  }
  await conversation.save();

  emitToUsers(conversation.members, 'chat:message', {
    conversationId: conversation._id,
    conversationName: NAMED.includes(conversation.type) ? conversation.name : null,
    conversationType: conversation.type,
    mutedBy: conversation.mutedBy.map(idStr),
    message: presentMessage(message),
  });
  if (parent) broadcastMessageUpdate(conversation, parent);

  // @mentions (and @channel / @here) also land in the bell.
  const pinged = mentionAll ? [...memberSet].filter((id) => id !== String(req.user._id)) : mentions;
  if (pinged.length) {
    notify(pinged, {
      actor: req.user._id,
      type: 'chat_mention',
      text: `${req.user.name} mentioned you in ${conversationLabel(conversation, req.user)}: ${previewOf(message).slice(0, 120)}`,
      link: `/chat?c=${conversation._id}&m=${parent ? parent._id : message._id}`,
    });
  }

  res.status(201).json({ message: presentMessage(message, req.user._id) });
});

// PATCH /api/chat/messages/:mid { text } : own messages only.
const editMessage = catchAsync(async (req, res) => {
  const { message, conversation } = await loadMessage(req);
  if (idStr(message.sender) !== String(req.user._id)) throw new ApiError(403, 'You can only edit your own messages');
  if (message.deletedAt) throw new ApiError(400, 'This message was deleted');
  const text = String(req.body.text || '').trim();
  if (text.length > Message.TEXT_MAX) throw new ApiError(400, `Message is longer than ${Message.TEXT_MAX} characters`);
  if (!text && !message.snippet && !message.media && message.files.length === 0) throw new ApiError(400, 'Message cannot be empty');
  if (text !== message.text) {
    message.text = text;
    message.editedAt = new Date();
    await message.save();
  }
  await message.populate('sender', MEMBER_FIELDS);
  broadcastMessageUpdate(conversation, message);
  res.status(200).json({ message: presentMessage(message, req.user._id) });
});

// DELETE /api/chat/messages/:mid : own messages only; leaves a "deleted" marker
// so thread replies keep their parent.
const deleteMessage = catchAsync(async (req, res) => {
  const { message, conversation } = await loadMessage(req);
  if (idStr(message.sender) !== String(req.user._id)) throw new ApiError(403, 'You can only delete your own messages');
  if (!message.deletedAt) {
    await Promise.all(message.files.map((f) => gridfs.deleteFile(f.fileId).catch(() => {})));
    message.text = '';
    message.snippet = null;
    message.media = null;
    message.files = [];
    message.reactions = [];
    message.mentions = [];
    message.pinnedAt = null;
    message.pinnedBy = null;
    message.deletedAt = new Date();
    await message.save();
  }
  await message.populate('sender', MEMBER_FIELDS);
  broadcastMessageUpdate(conversation, message);
  res.status(200).json({ message: presentMessage(message, req.user._id) });
});

// POST /api/chat/messages/:mid/reactions { emoji } : toggles my reaction.
const reactToMessage = catchAsync(async (req, res) => {
  const { message, conversation } = await loadMessage(req);
  if (message.deletedAt) throw new ApiError(400, 'This message was deleted');
  const emoji = String(req.body.emoji || '').trim();
  if (!emoji || emoji.length > 32) throw new ApiError(400, 'Pick an emoji');
  const me = String(req.user._id);
  let reaction = message.reactions.find((r) => r.emoji === emoji);
  if (!reaction) {
    message.reactions.push({ emoji, users: [] });
    reaction = message.reactions[message.reactions.length - 1];
  }
  if (has(reaction.users, me)) reaction.users = reaction.users.filter((u) => idStr(u) !== me);
  else reaction.users.push(req.user._id);
  message.reactions = message.reactions.filter((r) => r.users.length > 0);
  await message.save();
  await message.populate('sender', MEMBER_FIELDS);
  broadcastMessageUpdate(conversation, message);
  res.status(200).json({ message: presentMessage(message, req.user._id) });
});

// POST /api/chat/messages/:mid/pin : toggles the pin for everyone in the chat.
const pinMessage = catchAsync(async (req, res) => {
  const { message, conversation } = await loadMessage(req);
  if (message.deletedAt) throw new ApiError(400, 'This message was deleted');
  if (message.pinnedAt) {
    message.pinnedAt = null;
    message.pinnedBy = null;
  } else {
    message.pinnedAt = new Date();
    message.pinnedBy = req.user._id;
  }
  await message.save();
  await message.populate('sender', MEMBER_FIELDS);
  broadcastMessageUpdate(conversation, message);
  res.status(200).json({ message: presentMessage(message, req.user._id) });
});

// POST /api/chat/messages/:mid/save : toggles my bookmark (private to me).
const saveMessage = catchAsync(async (req, res) => {
  const { message } = await loadMessage(req);
  const me = String(req.user._id);
  if (has(message.savedBy, me)) message.savedBy = message.savedBy.filter((u) => idStr(u) !== me);
  else message.savedBy.push(req.user._id);
  await message.save();
  await message.populate('sender', MEMBER_FIELDS);
  res.status(200).json({ message: presentMessage(message, req.user._id) });
});

const listPins = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  const messages = await Message.find({ conversation: conversation._id, pinnedAt: { $ne: null }, deletedAt: null })
    .sort({ pinnedAt: -1 })
    .populate('sender', MEMBER_FIELDS);
  res.status(200).json({ messages: messages.map((m) => presentMessage(m, req.user._id)) });
});

async function myConversationIds(userId) {
  return (await Conversation.find({ members: userId }).select('_id')).map((c) => c._id);
}

const listSaved = catchAsync(async (req, res) => {
  const mine = await myConversationIds(req.user._id);
  const messages = await Message.find({ savedBy: req.user._id, deletedAt: null, conversation: { $in: mine } })
    .sort({ createdAt: -1 })
    .limit(200)
    .populate('sender', MEMBER_FIELDS);
  res.status(200).json({ messages: messages.map((m) => presentMessage(m, req.user._id)) });
});

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /api/chat/search?q= : messages in my conversations (text, snippets, file names).
const searchMessages = catchAsync(async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.status(200).json({ messages: [] });
  const rx = new RegExp(escapeRegex(q.slice(0, 100)), 'i');
  const mine = await myConversationIds(req.user._id);
  const messages = await Message.find({
    conversation: { $in: mine },
    deletedAt: null,
    $or: [{ text: rx }, { 'snippet.code': rx }, { 'snippet.title': rx }, { 'files.filename': rx }, { 'media.title': rx }],
  })
    .sort({ createdAt: -1 })
    .limit(40)
    .populate('sender', MEMBER_FIELDS);
  return res.status(200).json({ messages: messages.map((m) => presentMessage(m, req.user._id)) });
});

// GET /api/chat/messages/:mid/files/:fileId[?inline=1]
const downloadFile = catchAsync(async (req, res) => {
  const { message } = await loadMessage(req);
  const file = message.files.find((f) => String(f.fileId) === String(req.params.fileId));
  if (!file) throw new ApiError(404, 'File not found');
  const inline = req.query.inline === '1' && /^image\/(png|jpe?g|gif|webp)$/i.test(file.contentType);
  res.setHeader('Content-Type', inline ? file.contentType : 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
  gridfs
    .downloadStream(file.fileId)
    .on('error', () => !res.headersSent && res.status(404).end())
    .pipe(res);
});

// GET /api/chat/presence : { userId: 'online' | 'away' }
const presence = (req, res) => {
  res.status(200).json({ presence: getPresence() });
};

function markRead(conversation, userId, at = new Date()) {
  const existing = conversation.reads.find((r) => idStr(r.user) === idStr(userId));
  if (existing) existing.at = at;
  else conversation.reads.push({ user: userId, at });
}

const markConversationRead = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  const at = new Date();
  markRead(conversation, req.user._id, at);
  await conversation.save();
  // Live read receipts.
  emitToUsers(conversation.members, 'chat:read', { conversationId: conversation._id, userId: String(req.user._id), at });
  res.status(200).json({ ok: true });
});

module.exports = {
  listConversations,
  listChannels,
  createConversation,
  updateConversation,
  addMembers,
  removeMember,
  joinChannel,
  muteConversation,
  starConversation,
  listMessages,
  getThread,
  sendMessage,
  editMessage,
  deleteMessage,
  reactToMessage,
  pinMessage,
  saveMessage,
  listPins,
  listSaved,
  searchMessages,
  downloadFile,
  presence,
  markConversationRead,
};
