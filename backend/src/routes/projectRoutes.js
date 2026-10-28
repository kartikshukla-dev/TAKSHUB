const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const {
  createProject,
  listProjects,
  getProject,
  updateProject,
  deleteProject,
  addMember,
  getActivityFeed,
} = require('../controllers/projectController');

const router = express.Router();

router.use(requireAuth);

router.post('/', requireRole('admin'), createProject);
router.get('/', listProjects);
router.get('/:id', getProject);
router.patch('/:id', requireRole('admin'), updateProject);
router.delete('/:id', requireRole('admin'), deleteProject);
router.post('/:id/members', requireRole('admin'), addMember);
router.get('/:id/activity', getActivityFeed);

module.exports = router;
