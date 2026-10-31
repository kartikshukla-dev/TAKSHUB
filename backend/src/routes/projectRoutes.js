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
  removeMember,
  getActivityFeed,
} = require('../controllers/projectController');

const router = express.Router();

const staff = requireRole('admin', 'manager');

router.use(requireAuth);

router.post('/', staff, createProject);
router.get('/', listProjects);
router.get('/:id', getProject);
router.patch('/:id', staff, updateProject);
router.delete('/:id', requireRole('admin'), deleteProject);
router.post('/:id/members', staff, addMember);
router.delete('/:id/members/:userId', staff, removeMember);
router.get('/:id/activity', getActivityFeed);

module.exports = router;
