const { appendAuditEvent, readAuditLog, summariseAuditLog } = require('./_audit');
const { sendApiError, requireSession } = require('./_apiAuth');

const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || '';

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function parseRequestBody(req) {
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body || '{}'); } catch { return null; }
  }
  return req.body ?? {};
}

function isAdminSecretValid(req) {
  return !!ADMIN_API_SECRET && req.headers['x-admin-secret'] === ADMIN_API_SECRET;
}

module.exports = async function handler(req, res) {
  const allowedOrigin = process.env.ALLOWED_ORIGIN || 'https://slackspac3.github.io';
  const body = parseRequestBody(req);

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'content-type,x-admin-secret,x-session-token');
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const origin = req.headers.origin;
  if (origin && origin !== allowedOrigin) {
    sendApiError(res, 403, 'FORBIDDEN', 'Request origin is not allowed.');
    return;
  }

  if (req.method === 'POST' && !req.headers['content-type']?.includes('application/json')) {
    sendApiError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    return;
  }

  if (req.method === 'POST' && !isPlainObject(body)) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body.');
    return;
  }

  try {
    if (req.method === 'GET') {
      const session = isAdminSecretValid(req) ? { username: 'admin', role: 'admin' } : requireSession(req, res, { roles: ['admin'] });
      if (!session) return;
      const entries = await readAuditLog();
      res.status(200).json({ entries: [...entries].reverse(), summary: summariseAuditLog(entries) });
      return;
    }
    if (req.method === 'POST') {
      const session = isAdminSecretValid(req) ? { username: 'admin', role: 'admin' } : requireSession(req, res);
      if (!session) return;
      const entry = await appendAuditEvent({
        category: String(body.category || 'general').trim().slice(0, 80),
        eventType: String(body.eventType || 'event').trim().slice(0, 120),
        // Actor identity must come from the authenticated session, not the client payload.
        actorUsername: session?.username || 'system',
        actorRole: session?.role || 'system',
        target: String(body.target || '').trim().slice(0, 160),
        status: String(body.status || 'success').trim().slice(0, 40),
        source: String(body.source || 'client').trim().slice(0, 40),
        details: isPlainObject(body.details || {}) ? body.details : {}
      });
      res.status(201).json({ entry });
      return;
    }
    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  } catch (error) {
    console.error('Audit-log API request failed.', error);
    sendApiError(res, 500, 'AUDIT_REQUEST_FAILED', 'The audit request could not be completed.');
  }
};
