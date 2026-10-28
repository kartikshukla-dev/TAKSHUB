const { Server } = require('socket.io');

let io = null;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: process.env.FRONTEND_URL || '*' },
  });

  io.on('connection', (socket) => {
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

// Broadcasts an event to everyone currently viewing a given project's board.
function emitToProject(projectId, event, payload) {
  if (!io) return;
  io.to(roomName(projectId)).emit(event, payload);
}

function getIO() {
  return io;
}

module.exports = { initSocket, emitToProject, getIO };
