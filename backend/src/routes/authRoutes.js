const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  register,
  login,
  me,
  providers,
  googleAuth,
  googleCallback,
  googleFailure,
} = require('../controllers/authController');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', requireAuth, me);
router.get('/providers', providers);

router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);
router.get('/google/failure', googleFailure);

module.exports = router;
