const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');
const emailService = require('../services/emailService');
const templates = require('../services/emailTemplates');

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/admin/email/status : which provider is active (never returns secrets).
const getStatus = (req, res) => {
  res.status(200).json({ ...emailService.status(), templates: Object.keys(templates.previews()) });
};

// POST /api/admin/email/test { to? } : sends the test email (defaults to the admin).
const sendTest = catchAsync(async (req, res) => {
  const to = req.body.to ? String(req.body.to).trim() : req.user.email;
  if (!EMAIL_RX.test(to)) throw new ApiError(400, 'Enter a valid email address');
  try {
    const result = await emailService.sendTestEmail({ user: req.user, to });
    res.status(200).json({ ok: true, to, provider: emailService.status().provider, messageId: result?.messageId || null });
  } catch (err) {
    if (err.statusCode) throw err;
    // Provider rejected it: show the provider's reason to the admin.
    throw new ApiError(502, `Email provider error: ${err.message}`);
  }
});

// GET /api/admin/email/preview/:template : rendered HTML with sample data.
const preview = (req, res) => {
  const all = templates.previews();
  const mail = all[req.params.template];
  if (!mail) throw new ApiError(404, 'Unknown template');
  res.status(200).json({ subject: mail.subject, html: mail.html });
};

module.exports = { getStatus, sendTest, preview };
