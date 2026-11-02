// Workspace-wide endpoints that aren't tied to a single project.
const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { listAllTasks } = require('../controllers/taskController');
const { dashboard, reports } = require('../controllers/statsController');
const { listActivity } = require('../controllers/activityController');
const {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../controllers/departmentController');
const { listTodos, createTodo, updateTodo, deleteTodo } = require('../controllers/todoController');
const {
  listConversations,
  createConversation,
  listMessages,
  sendMessage,
  markConversationRead,
} = require('../controllers/chatController');
const { listNotifications, markRead, markAllRead } = require('../controllers/notificationController');
const { search } = require('../controllers/searchController');
const emailAdmin = require('../controllers/emailController');
const { createTask } = require('../controllers/taskController');
const { invite, resendInvite, revokeInvite } = require('../controllers/userController');
const { listTeams, getTeam } = require('../controllers/teamController');

const router = express.Router();
const admin = requireRole('admin');

// Auth only on this router's own paths, so unknown /api routes still 404.
router.use(
  ['/tasks', '/stats', '/activity', '/departments', '/todos', '/chat', '/notifications', '/search', '/admin', '/teams', '/invites'],
  requireAuth
);

router.get('/tasks', listAllTasks);
// Raise a task to a team, with or without a project.
router.post('/tasks', createTask);

router.get('/teams', listTeams);
router.get('/teams/:id', getTeam);

router.post('/invites', invite);
router.post('/invites/:id/resend', resendInvite);
router.delete('/invites/:id', revokeInvite);

router.get('/stats/dashboard', dashboard);
router.get('/stats/reports', reports);

router.get('/activity', listActivity);

router.get('/departments', listDepartments);
router.post('/departments', admin, createDepartment);
router.patch('/departments/:id', admin, updateDepartment);
router.delete('/departments/:id', admin, deleteDepartment);

router.get('/todos', listTodos);
router.post('/todos', createTodo);
router.patch('/todos/:id', updateTodo);
router.delete('/todos/:id', deleteTodo);

router.get('/chat/conversations', listConversations);
router.post('/chat/conversations', createConversation);
router.get('/chat/conversations/:id/messages', listMessages);
router.post('/chat/conversations/:id/messages', sendMessage);
router.post('/chat/conversations/:id/read', markConversationRead);

router.get('/notifications', listNotifications);
router.post('/notifications/read-all', markAllRead);
router.post('/notifications/:id/read', markRead);

router.get('/search', search);

router.get('/admin/email/status', admin, emailAdmin.getStatus);
router.post('/admin/email/test', admin, emailAdmin.sendTest);
router.get('/admin/email/preview/:template', admin, emailAdmin.preview);

module.exports = router;
