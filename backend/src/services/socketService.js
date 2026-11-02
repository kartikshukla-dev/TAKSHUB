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
        // Team room, so task updates reach everyone in the raising and
        // receiving teams. Looked up because the token has no department.
        // eslint-disable-next-line global-require
        require('../models/User')
          .findById(payload.sub)
          .select('department')
          .then((u) => u && u.department && socket.join(teamRoom(u.department)))
          .catch(() => {});
      } catch {
        // Invalid token: treat as anonymous.
      }
    }

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

function getIO() {
  return io;
}

module.exports = { initSocket, emitToProject, emitToUsers, emitTaskEvent, getIO };
