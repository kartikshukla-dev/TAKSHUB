const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { requireRole } = require('../middleware/roleCheck');
const { listUsers, getUser, updateUser, updateMe, changePassword } = require('../controllers/userController');

const router = express.Router();

router.use(requireAuth);
router.get('/', listUsers);
router.patch('/me', updateMe);
router.post('/me/password', changePassword);
router.get('/:id', getUser);
router.patch('/:id', requireRole('admin'), updateUser);

module.exports = router;
