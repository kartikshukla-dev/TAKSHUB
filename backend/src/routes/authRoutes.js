const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  requestCode,
  verifyCode,
  me,
  providers,
  googleAuth,
  googleCallback,
  googleFailure,
} = require('../controllers/authController');

const router = express.Router();

// Sign-in is email + one-time code, or Google. There is no password login
// and no self sign-up: people join through an invite.
router.post('/otp/request', requestCode);
router.post('/otp/verify', verifyCode);
router.get('/me', requireAuth, me);
router.get('/providers', providers);

router.get('/google', googleAuth);
router.get('/google/callback', googleCallback);
router.get('/google/failure', googleFailure);

module.exports = router;
