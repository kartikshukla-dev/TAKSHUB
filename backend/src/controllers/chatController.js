const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const { emitToUsers } = require('../services/socketService');

const MEMBER_FIELDS = 'name email avatar jobTitle';

function isMember(conversation, userId) {
  return conversation.members.some((m) => (m._id || m).toString() === userId.toString());
}

// Membership is the only access rule: admins can't read chats they're not in.
async function loadConversation(req) {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) throw new ApiError(400, 'Invalid id format');
  const conversation = await Conversation.findById(req.params.id);
  if (!conversation || !isMember(conversation, req.user._id)) throw new ApiError(404, 'Conversation not found');
  return conversation;
}

async function unreadCount(conversation, userId) {
  const read = conversation.reads.find((r) => r.user.toString() === userId.toString());
  const filter = { conversation: conversation._id, sender: { $ne: userId } };
  if (read) filter.createdAt = { $gt: read.at };
  return Message.countDocuments(filter);
}

async function present(conversation, userId) {
  await conversation.populate('members', MEMBER_FIELDS);
  const json = conversation.toObject();
  delete json.reads;
  return { ...json, unread: await unreadCount(conversation, userId) };
}

const listConversations = catchAsync(async (req, res) => {
  const conversations = await Conversation.find({ members: req.user._id }).sort({ lastMessageAt: -1, updatedAt: -1 });
  const result = await Promise.all(conversations.map((c) => present(c, req.user._id)));
  res.status(200).json({ conversations: result });
});

// POST /api/chat/conversations
//   { type: 'direct', userId }            -> finds or creates the DM
//   { type: 'group', name, memberIds[] }  -> creates a group including the caller
const createConversation = catchAsync(async (req, res) => {
  const { type } = req.body;
  const me = req.user._id;

  if (type === 'direct') {
    const { userId } = req.body;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) throw new ApiError(400, 'userId is required');
    if (userId === me.toString()) throw new ApiError(400, 'You cannot message yourself');
    const other = await User.findById(userId).select('_id');
    if (!other) throw new ApiError(404, 'User not found');

    let conversation = await Conversation.findOne({
      type: 'direct',
      members: { $all: [me, other._id], $size: 2 },
    });
    let status = 200;
    if (!conversation) {
      conversation = await Conversation.create({ type: 'direct', members: [me, other._id], createdBy: me });
      status = 201;
    }
    return res.status(status).json({ conversation: await present(conversation, me) });
  }

  if (type === 'group') {
    const { name, memberIds } = req.body;
    if (!name || !name.trim()) throw new ApiError(400, 'Group name is required');
    const ids = [...new Set([me.toString(), ...(Array.isArray(memberIds) ? memberIds : [])])].filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );
    if (ids.length < 2) throw new ApiError(400, 'Pick at least one other person');
    const found = await User.countDocuments({ _id: { $in: ids } });
    if (found !== ids.length) throw new ApiError(400, 'Some members were not found');
    const conversation = await Conversation.create({ type: 'group', name: name.trim(), members: ids, createdBy: me });
    const presented = await present(conversation, me);
    emitToUsers(ids, 'chat:conversation', presented);
    return res.status(201).json({ conversation: presented });
  }

  throw new ApiError(400, "type must be 'direct' or 'group'");
});

const listMessages = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  const filter = { conversation: conversation._id };
  if (req.query.before) filter.createdAt = { $lt: new Date(req.query.before) };
  const messages = await Message.find(filter)
    .sort({ createdAt: -1 })
    .limit(Math.min(Number(req.query.limit) || 50, 200))
    .populate('sender', MEMBER_FIELDS);
  res.status(200).json({ messages: messages.reverse() });
});

const sendMessage = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  const text = (req.body.text || '').trim();
  if (!text) throw new ApiError(400, 'Message cannot be empty');

  const message = await Message.create({ conversation: conversation._id, sender: req.user._id, text });
  await message.populate('sender', MEMBER_FIELDS);

  conversation.lastMessageAt = message.createdAt;
  conversation.lastMessageText = text.slice(0, 200);
  markRead(conversation, req.user._id, message.createdAt);
  await conversation.save();

  emitToUsers(conversation.members, 'chat:message', {
    conversationId: conversation._id,
    conversationName: conversation.type === 'group' ? conversation.name : null,
    message,
  });
  res.status(201).json({ message });
});

function markRead(conversation, userId, at = new Date()) {
  const existing = conversation.reads.find((r) => r.user.toString() === userId.toString());
  if (existing) existing.at = at;
  else conversation.reads.push({ user: userId, at });
}

const markConversationRead = catchAsync(async (req, res) => {
  const conversation = await loadConversation(req);
  markRead(conversation, req.user._id);
  await conversation.save();
  res.status(200).json({ ok: true });
});

module.exports = { listConversations, createConversation, listMessages, sendMessage, markConversationRead };
