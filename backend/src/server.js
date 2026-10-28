require('dotenv').config();
const http = require('http');

const createApp = require('./app');
const { connectDB } = require('./config/db');
const { initSocket } = require('./services/socketService');

async function start() {
  await connectDB();

  const app = createApp();
  const httpServer = http.createServer(app);

  initSocket(httpServer);

  const port = process.env.PORT || 5000;
  httpServer.listen(port, () => {
    console.log(`[server] TaskHub API listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error('[server] Failed to start:', err);
  process.exit(1);
});
