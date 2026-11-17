const { Server } = require('socket.io');
const { verifyToken } = require('../utils/jwt');

let io = null;

const STAFF_ROOM = 'role:staff';

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: require('../utils/frontendUrls').corsOrigin() },
  });

  io.on('connection', (socket) => {
    // Optional auth: a valid JWT in the handshake puts the socket in its
    // personal room (chat, notifications) and, for admins/managers, the
    // staff room. Sockets without a token can still join project rooms.
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (token) {
      try {
        const payload = verifyToken(token);
        socket.data.userId = payload.sub;
        socket.join(userRoom(payload.sub));
        if (payload.role === 'admin') socket.join(STAFF_ROOM);
        presenceJoin(payload.sub, socket.id);
        // Team room, so task updates reach everyone in the raising and
        // receiving teams. Looked up because the token has no department.
        // eslint-disable-next-line global-require
        require('../models/User')
          .findById(payload.sub)
          .select('department name')
          .then((u) => {
            if (!u) return;
            socket.data.name = u.name;
            if (u.department) socket.join(teamRoom(u.department));
          })
          .catch(() => {});
      } catch {
        // Invalid token: treat as anonymous.
      }
    }

    // Tab hidden / visible -> "away" / "online" (only when every tab is hidden).
    socket.on('presence:away', (away) => {
      if (socket.data.userId) presenceSet(socket.data.userId, socket.id, Boolean(away));
    });

    // "Rahul is typing…": relayed to the other members after a membership check.
    socket.on('chat:typing', async (conversationId) => {
      const userId = socket.data.userId;
      if (!userId || !conversationId || !/^[a-f\d]{24}$/i.test(String(conversationId))) return;
      try {
        // eslint-disable-next-line global-require
        const conv = await require('../models/Conversation').findOne({ _id: conversationId, members: userId }).select('members');
        if (!conv) return;
        const others = conv.members.map(String).filter((m) => m !== String(userId));
        if (others.length) {
          io.to(others.map(userRoom)).emit('chat:typing', { conversationId: String(conversationId), userId, name: socket.data.name || '' });
        }
      } catch {
        /* ignore */
      }
    });

    socket.on('disconnect', () => {
      if (socket.data.userId) presenceLeave(socket.data.userId, socket.id);
    });

    socket.on('project:join', (projectId) => {
      socket.join(roomName(projectId));
    });
    socket.on('project:leave', (projectId) => {
      socket.leave(roomName(projectId));
    });
  });

  return io;
}

function roomName(projectId) {
  return `project:${projectId}`;
}

function userRoom(userId) {
  return `user:${userId}`;
}

function teamRoom(teamId) {
  return `team:${teamId}`;
}

// Broadcasts an event to everyone currently viewing a given project's board.
function emitToProject(projectId, event, payload) {
  if (!io) return;
  io.to(roomName(projectId)).emit(event, payload);
}

function emitToUsers(userIds, event, payload) {
  if (!io || !userIds.length) return;
  io.to(userIds.map((id) => userRoom(id.toString()))).emit(event, payload);
}

// Sends a task event to everyone who may see the task: the project room,
// project members, assignee, reporter and staff. socket.io de-duplicates
// sockets that are in several of these rooms.
function emitTaskEvent(project, task, event, payload) {
  if (!io) return;
  const idOf = (v) => v && (v._id || v).toString();
  const rooms = new Set([roomName(project._id), STAFF_ROOM]);
  (project.members || []).forEach((m) => rooms.add(userRoom(idOf(m))));
  if (task.assignee) rooms.add(userRoom(idOf(task.assignee)));
  if (task.reporter) rooms.add(userRoom(idOf(task.reporter)));
  if (task.fromTeam) rooms.add(teamRoom(idOf(task.fromTeam)));
  if (task.toTeam) rooms.add(teamRoom(idOf(task.toTeam)));
  if (project.visibility === 'workspace' && !project.system) {
    io.emit(event, payload);
    return;
  }
  io.to([...rooms]).emit(event, payload);
}

// ---------- presence (in memory, per server process) ----------
// userId -> Map(socketId -> away)
const presence = new Map();

function statusOf(userId) {
  const sockets = presence.get(String(userId));
  if (!sockets || sockets.size === 0) return 'offline';
  return [...sockets.values()].every(Boolean) ? 'away' : 'online';
}

function broadcastPresence(userId, before) {
  const now = statusOf(userId);
  if (io && now !== before) io.emit('presence', { userId: String(userId), status: now });
}

function presenceJoin(userId, socketId) {
  const before = statusOf(userId);
  if (!presence.has(String(userId))) presence.set(String(userId), new Map());
  presence.get(String(userId)).set(socketId, false);
  broadcastPresence(userId, before);
}

function presenceSet(userId, socketId, away) {
  const sockets = presence.get(String(userId));
  if (!sockets || !sockets.has(socketId)) return;
  const before = statusOf(userId);
  sockets.set(socketId, away);
  broadcastPresence(userId, before);
}

function presenceLeave(userId, socketId) {
  const sockets = presence.get(String(userId));
  if (!sockets) return;
  const before = statusOf(userId);
  sockets.delete(socketId);
  if (sockets.size === 0) presence.delete(String(userId));
  broadcastPresence(userId, before);
}

// { userId: 'online' | 'away' } for everyone connected right now.
function getPresence() {
  const out = {};
  presence.forEach((_, userId) => {
    out[userId] = statusOf(userId);
  });
  return out;
}

function getIO() {
  return io;
}

module.exports = { initSocket, emitToProject, emitToUsers, emitTaskEvent, getIO, getPresence };
