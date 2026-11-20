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
const multer = require('multer');
const chat = require('../controllers/chatController');

// Chat attachments: up to 5 files of 10 MB each (same per-file limit as tasks).
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 5, fieldSize: 1024 * 1024 },
});
const stickers = require('../controllers/stickerController');
const pushApi = require('../controllers/pushController');
const recurringApi = require('../controllers/recurringController');

// Custom stickers: one image, 1 MB.
const stickerUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: stickers.STICKER_MAX_BYTES, files: 1 },
});
const { listNotifications, markRead, markAllRead } = require('../controllers/notificationController');
const { search } = require('../controllers/searchController');
const emailAdmin = require('../controllers/emailController');
const auditAdmin = require('../controllers/auditController');
const { createTask } = require('../controllers/taskController');
const { invite, resendInvite, revokeInvite } = require('../controllers/userController');
const { listTeams, getTeam } = require('../controllers/teamController');

const router = express.Router();
const admin = requireRole('admin');

// Auth only on this router's own paths, so unknown /api routes still 404.
router.use(
  ['/tasks', '/stats', '/activity', '/departments', '/todos', '/chat', '/notifications', '/search', '/admin', '/teams', '/invites', '/push', '/recurring'],
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

router.get('/chat/conversations', chat.listConversations);
router.post('/chat/conversations', chat.createConversation);
router.patch('/chat/conversations/:id', chat.updateConversation);
router.post('/chat/conversations/:id/members', chat.addMembers);
router.delete('/chat/conversations/:id/members/:userId', chat.removeMember);
router.post('/chat/conversations/:id/join', chat.joinChannel);
router.post('/chat/conversations/:id/mute', chat.muteConversation);
router.post('/chat/conversations/:id/star', chat.starConversation);
router.get('/chat/conversations/:id/messages', chat.listMessages);
router.post('/chat/conversations/:id/messages', chatUpload.array('files', 5), chat.sendMessage);
router.get('/chat/conversations/:id/pins', chat.listPins);
router.post('/chat/conversations/:id/read', chat.markConversationRead);
router.get('/chat/channels', chat.listChannels);
router.get('/chat/saved', chat.listSaved);
router.get('/chat/search', chat.searchMessages);
router.get('/chat/presence', chat.presence);
router.get('/chat/messages/:mid/thread', chat.getThread);
router.patch('/chat/messages/:mid', chat.editMessage);
router.delete('/chat/messages/:mid', chat.deleteMessage);
router.post('/chat/messages/:mid/reactions', chat.reactToMessage);
router.post('/chat/messages/:mid/pin', chat.pinMessage);
router.post('/chat/messages/:mid/save', chat.saveMessage);
router.get('/chat/messages/:mid/files/:fileId', chat.downloadFile);

// Stickers and GIFs.
router.get('/chat/stickers', stickers.listStickers);
router.post('/chat/stickers', stickerUpload.single('image'), stickers.uploadSticker);
router.post('/chat/stickers/saved', stickers.toggleSaved);
router.delete('/chat/stickers/recent', stickers.clearRecent);
router.get('/chat/stickers/:id/image', stickers.stickerImage);
router.patch('/chat/stickers/:id', stickers.updateSticker);
router.delete('/chat/stickers/:id', stickers.deleteSticker);
router.get('/chat/giphy/:kind', stickers.giphySearch);

// Web Push (notifications when the app is closed).
router.get('/push/config', pushApi.getConfig);
router.post('/push/subscriptions', pushApi.subscribe);
router.delete('/push/subscriptions', pushApi.unsubscribe);

// Repeating tasks.
router.get('/recurring/:id', recurringApi.getRecurring);
router.patch('/recurring/:id', recurringApi.updateRecurring);

router.get('/notifications', listNotifications);
router.post('/notifications/read-all', markAllRead);
router.post('/notifications/:id/read', markRead);

router.get('/search', search);

router.get('/admin/email/status', admin, emailAdmin.getStatus);
router.post('/admin/email/test', admin, emailAdmin.sendTest);
router.get('/admin/email/preview/:template', admin, emailAdmin.preview);

// Audit log: Super Admin only, read-only.
router.get('/admin/audit', admin, auditAdmin.listAudit);
router.get('/admin/audit/facets', admin, auditAdmin.auditFacets);
router.get('/admin/audit/export', admin, auditAdmin.exportAudit);
router.get('/admin/requests', admin, auditAdmin.listRequests);
router.get('/admin/requests/export', admin, auditAdmin.exportRequests);

module.exports = router;
