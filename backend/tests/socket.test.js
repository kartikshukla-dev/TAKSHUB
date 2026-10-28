const http = require('http');
const { io: ioClient } = require('socket.io-client');
const { initSocket, emitToProject } = require('../src/services/socketService');

describe('Socket.io project rooms', () => {
  let httpServer;
  let port;

  beforeAll((done) => {
    httpServer = http.createServer();
    initSocket(httpServer);
    httpServer.listen(() => {
      port = httpServer.address().port;
      done();
    });
  });

  afterAll((done) => {
    httpServer.close(done);
  });

  it('broadcasts an event to every client that joined the same project room', (done) => {
    const projectId = 'project-xyz';
    const url = `http://localhost:${port}`;

    const clientA = ioClient(url, { transports: ['websocket'] });
    const clientB = ioClient(url, { transports: ['websocket'] });

    let receivedCount = 0;
    const checkDone = () => {
      receivedCount += 1;
      if (receivedCount === 2) {
        clientA.close();
        clientB.close();
        done();
      }
    };

    const onConnectBoth = () => {
      if (clientA.connected && clientB.connected) {
        clientA.emit('project:join', projectId);
        clientB.emit('project:join', projectId);

        setTimeout(() => {
          emitToProject(projectId, 'task:created', { title: 'Broadcast test task' });
        }, 100);
      }
    };

    clientA.on('connect', onConnectBoth);
    clientB.on('connect', onConnectBoth);

    clientA.on('task:created', (payload) => {
      expect(payload.title).toBe('Broadcast test task');
      checkDone();
    });
    clientB.on('task:created', (payload) => {
      expect(payload.title).toBe('Broadcast test task');
      checkDone();
    });
  }, 10000);
});
