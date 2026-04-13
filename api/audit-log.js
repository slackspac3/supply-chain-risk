const { appendAuditEvent, readAuditLog, summariseAuditLog } = require('./_audit');
const { isRequestSecretValid, sendApiError, requireSession } = require('./_apiAuth');
const { applyCorsHeaders, getUnexpectedFields, isAllowedOrigin, isPlainObject, parseRequestBody } = require('./_request');

const ADMIN_API_SECRET = process.env.ADMIN_API_SECRET || '';

function isAdminSecretValid(req) {
  return isRequestSecretValid(req, 'x-admin-secret', ADMIN_API_SECRET);
}

function isScopedBuAdminSession(session = {}) {
  return String(session?.role || '').trim().toLowerCase() === 'bu_admin';
}

function getSessionBusinessUnitEntityId(session = {}) {
  return String(session?.businessUnitEntityId || '').trim();
}

function normaliseAuditBusinessUnitValues(value) {
  if (Array.isArray(value)) {
    return value.map(item => String(item || '').trim()).filter(Boolean);
  }
  const singleValue = String(value || '').trim();
  return singleValue ? [singleValue] : [];
}

function entryMatchesBusinessUnit(entry = {}, businessUnitEntityId = '') {
  const safeBusinessUnitEntityId = String(businessUnitEntityId || '').trim();
  if (!safeBusinessUnitEntityId) return false;
  const details = isPlainObject(entry?.details) ? entry.details : {};
  const candidates = [
    ...normaliseAuditBusinessUnitValues(details.businessUnitEntityId),
    ...normaliseAuditBusinessUnitValues(details.actorBusinessUnitEntityId),
    ...normaliseAuditBusinessUnitValues(details.targetBusinessUnitEntityId),
    ...normaliseAuditBusinessUnitValues(details.businessUnitEntityIds)
  ];
  return candidates.includes(safeBusinessUnitEntityId);
}

function buildAuditScope(session = {}) {
  if (isScopedBuAdminSession(session)) {
    return {
      type: 'business_unit',
      businessUnitEntityId: getSessionBusinessUnitEntityId(session)
    };
  }
  return {
    type: 'global',
    businessUnitEntityId: ''
  };
}

module.exports = async function handler(req, res) {
  const body = parseRequestBody(req);
  applyCorsHeaders(req, res, {
    methods: 'GET,POST,OPTIONS',
    headers: 'content-type,x-admin-secret,x-session-token'
  });

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
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
      const session = isAdminSecretValid(req)
        ? { username: 'admin', role: 'admin' }
        : await requireSession(req, res, { roles: ['admin', 'bu_admin'] });
      if (!session) return;
      const entries = await readAuditLog();
      if (isScopedBuAdminSession(session) && !getSessionBusinessUnitEntityId(session)) {
        sendApiError(res, 403, 'FORBIDDEN', 'BU admin access requires a business-unit assignment.');
        return;
      }
      const scopedEntries = isScopedBuAdminSession(session)
        ? entries.filter(entry => entryMatchesBusinessUnit(entry, getSessionBusinessUnitEntityId(session)))
        : entries;
      res.status(200).json({
        entries: [...scopedEntries].reverse(),
        summary: summariseAuditLog(scopedEntries),
        scope: buildAuditScope(session)
      });
      return;
    }
    if (req.method === 'POST') {
      if (getUnexpectedFields(body, ['category', 'details', 'eventType', 'source', 'status', 'target']).length) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Unexpected fields were included in the audit request.');
        return;
      }
      const session = isAdminSecretValid(req) ? { username: 'admin', role: 'admin' } : await requireSession(req, res);
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
        details: (() => {
          const details = isPlainObject(body.details || {}) ? { ...body.details } : {};
          const actorBusinessUnitEntityId = getSessionBusinessUnitEntityId(session);
          if (actorBusinessUnitEntityId && !String(details.actorBusinessUnitEntityId || '').trim()) {
            details.actorBusinessUnitEntityId = actorBusinessUnitEntityId;
          }
          if (actorBusinessUnitEntityId && !String(details.businessUnitEntityId || '').trim() && isScopedBuAdminSession(session)) {
            details.businessUnitEntityId = actorBusinessUnitEntityId;
          }
          return details;
        })()
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
