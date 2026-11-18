const { record, describe, entityFromParams, actorFields } = require('../services/auditService');

// Records every change made through the API (POST / PUT / PATCH / DELETE),
// plus downloads, exports and sign-ins, after the response has been sent.
// Controllers can add detail by setting `req.audit`:
//   { entity, entityId, entityLabel, changes: { field: { from, to } }, meta,
//     actor (user, e.g. on sign-in), summary, action, skip }
function auditMiddleware(req, res, next) {
  const started = Date.now();
  res.on('finish', () => {
    // req.route is only set once a route matched; unknown URLs (404) skip.
    if (!req.route) return;
    const found = describe(req.method, req.originalUrl.split('?')[0]);
    const extra = req.audit || {};
    if (!found || extra.skip) return;
    const { info, params } = found;

    const isChat = info.category === 'chat';
    // Google sign-in always answers with a redirect, so it reports ok itself.
    const ok = extra.ok !== undefined ? extra.ok : res.statusCode < 400;
    const who = extra.actor || req.user;
    // What was sent: the body (secrets hidden, chat text kept private),
    // unless the controller gave a proper before -> after.
    const body = req.body && Object.keys(req.body).length ? req.body : null;
    const files = (req.files || (req.file ? [req.file] : [])).map((f) => ({ name: f.originalname, size: f.size, type: f.mimetype }));

    const { entity, entityId } = entityFromParams(info.category, params);
    const action = extra.action || (ok ? info.action : `${extra.failAction || info.action}.failed`);

    record({
      ...actorFields(who),
      // Failed sign-ins have no user yet: keep the email that was tried.
      actorEmail: (who && who.email) || (req.body && typeof req.body.email === 'string' ? req.body.email.toLowerCase().trim() : ''),
      action,
      category: info.category,
      summary: extra.summary || (ok ? info.summary : `${info.summary} (failed)`),
      entity: extra.entity || entity,
      entityId: String(extra.entityId || entityId || ''),
      entityLabel: extra.entityLabel || labelFromBody(req.body, isChat),
      changes: extra.changes || (body ? { request: isChat ? sanitizeChat(body) : body } : null),
      meta: { ...(files.length ? { files } : {}), ...(extra.meta || {}) },
      ok,
      status: res.statusCode,
      error: ok ? '' : extra.error || res.locals.errorMessage || '',
      method: req.method,
      path: req.originalUrl.split('?')[0],
      ip: req.ip || '',
      userAgent: String(req.get('user-agent') || '').slice(0, 300),
      durationMs: Date.now() - started,
    });
  });
  next();
}

// A readable "on what" when the controller didn't set one: the name or
// title that was sent (team, project, to-do, channel), or the email tried.
function labelFromBody(body, isChat) {
  if (!body || typeof body !== 'object') return '';
  const v = body.name || (!isChat && body.title) || body.email || '';
  return typeof v === 'string' ? v.slice(0, 200) : '';
}

// Chat: say what kind of message it was, never what it said.
function sanitizeChat(body) {
  const out = { ...body };
  if (typeof out.text === 'string') out.text = out.text ? `[private, ${out.text.length} chars]` : '';
  if (out.snippet) {
    let s = out.snippet;
    if (typeof s === 'string') {
      try {
        s = JSON.parse(s);
      } catch {
        s = {};
      }
    }
    out.snippet = { title: s.title || '', language: s.language || '', lines: String(s.code || '').split('\n').length };
  }
  return out;
}

module.exports = auditMiddleware;
