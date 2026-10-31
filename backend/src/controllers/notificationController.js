const Notification = require('../models/Notification');
const catchAsync = require('../utils/catchAsync');

const listNotifications = catchAsync(async (req, res) => {
  const [notifications, unreadCount] = await Promise.all([
    Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(Math.min(Number(req.query.limit) || 30, 100))
      .populate('actor', 'name avatar'),
    Notification.countDocuments({ user: req.user._id, read: false }),
  ]);
  res.status(200).json({ notifications, unreadCount });
});

const markRead = catchAsync(async (req, res) => {
  await Notification.updateOne({ _id: req.params.id, user: req.user._id }, { $set: { read: true } });
  res.status(200).json({ ok: true });
});

const markAllRead = catchAsync(async (req, res) => {
  await Notification.updateMany({ user: req.user._id, read: false }, { $set: { read: true } });
  res.status(200).json({ ok: true });
});

module.exports = { listNotifications, markRead, markAllRead };
