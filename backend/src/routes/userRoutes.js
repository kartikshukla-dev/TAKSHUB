const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { listUsers } = require('../controllers/userController');

const router = express.Router();

router.use(requireAuth);
router.get('/', listUsers);

module.exports = router;
