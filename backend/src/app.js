const express = require('express');
const cors = require('cors');
const passport = require('passport');

const { getConnectionState } = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const taskRoutes = require('./routes/taskRoutes');
const userRoutes = require('./routes/userRoutes');
const workspaceRoutes = require('./routes/workspaceRoutes');

function createApp() {
  const app = express();

  app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
  app.use(express.json());
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
