const express = require('express');
const multer = require('multer');
const { requireAuth } = require('../middleware/auth');
const {
  createTask,
  listTasks,
  getTask,
  updateTask,
  deleteTask,
  addComment,
  uploadAttachment,
  downloadAttachment,
} = require('../controllers/taskController');

const router = express.Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.use(requireAuth);

router.post('/', createTask);
router.get('/', listTasks);
router.get('/:id', getTask);
router.patch('/:id', updateTask);
router.delete('/:id', deleteTask);

router.post('/:id/comments', addComment);

router.post('/:id/attachments', upload.single('file'), uploadAttachment);
router.get('/:id/attachments/:fileId', downloadAttachment);

module.exports = router;
