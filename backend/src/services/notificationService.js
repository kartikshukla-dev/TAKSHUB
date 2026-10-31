const Notification = require('../models/Notification');
const { emitToUsers } = require('./socketService');

// Creates one notification per recipient (skipping the actor and duplicates)
// and pushes it over the recipient's socket room. Failures are logged, never
// thrown, so a notification problem can't break the request that caused it.
async function notify(recipientIds, { actor, type, text, link }) {
  const actorId = actor ? actor.toString() : null;
  const unique = [...new Set(recipientIds.filter(Boolean).map((id) => (id._id || id).toString()))].filter(
    (id) => id !== actorId
  );
  if (unique.length === 0) return [];
  try {
    const docs = await Notification.insertMany(
      unique.map((user) => ({ user, actor: actorId, type, text, link }))
    );
    docs.forEach((doc) => emitToUsers([doc.user], 'notification:new', doc));
    return docs;
  } catch (err) {
    console.error('[notify] failed:', err.message);
    return [];
  }
}

module.exports = { notify };
