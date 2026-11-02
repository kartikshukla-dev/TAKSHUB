const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { listUsers, getUser, updateUser, updateMe } = require('../controllers/userController');

const router = express.Router();

router.use(requireAuth);
router.get('/', listUsers);
router.patch('/me', updateMe);
router.get('/:id', getUser);
// Only Super Admins give roles and move people between teams.
router.patch('/:id', requireRole('admin'), updateUser);

module.exports = router;
