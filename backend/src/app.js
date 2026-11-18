const express = require('express');
const cors = require('cors');
const passport = require('passport');
const compression = require('compression');
const auditMiddleware = require('./middleware/audit');
const { requestLogger } = require('./middleware/requestLogger');

const { getConnectionState } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');

function createApp() {
  const app = express();
  // First, so even requests that fail early (bad JSON, CORS) are logged:
  // one line in `pm2 logs` + a row in `requestlogs`.
  app.use(requestLogger());

  app.use(cors({ origin: require('./utils/frontendUrls').corsOrigin(), credentials: true }));
  // gzip JSON replies (task lists shrink ~5-10x over the wire).
  app.use(compression({ threshold: 1024 }));
  // 1 MB: chat code snippets can be up to 200k characters.
  app.use(express.json({ limit: '1mb' }));
  // Real client IP for the audit log. Default trusts only a proxy on the
  // same machine (nginx -> 127.0.0.1), so clients can't fake their IP.
  app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');
  app.use('/api', auditMiddleware);
  app.use(passport.initialize());

  require('./config/passport')(passport);

  app.get('/api/health', (req, res) => {
    const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
    const dbState = getConnectionState();
    res.status(200).json({
      status: 'ok',
      db: states[dbState] || 'unknown',
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/projects', projectRoutes);
  app.use('/api/projects/:projectId/tasks', taskRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api', workspaceRoutes);

  app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
  });

  app.use(errorHandler);

  return app;
}

module.exports = createApp;
