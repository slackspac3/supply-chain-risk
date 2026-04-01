const USER_STATE_PREFIX = process.env.USER_STATE_PREFIX || 'risk_calculator_user_state';
const { appendAuditEvent } = require('./_audit');
const { sendApiError, requireSession, sendConflictError } = require('./_apiAuth');
const { applyCorsHeaders, getUnexpectedFields, isAllowedOrigin, isPlainObject, parseRequestBody } = require('./_request');
const { get: kvGet, set: kvSet } = require('./_kvStore');
const {
  normaliseUserWorkspaceState,
  applyUserWorkspacePatch,
  serializeUserWorkspaceState
} = require('../assets/state/userWorkspacePersistence.js');

function buildStateKey(username = '') {
  return `${USER_STATE_PREFIX}__${String(username || '').trim().toLowerCase()}`;
}

function normaliseState(state = {}) {
  return normaliseUserWorkspaceState(state);
}

async function readUserState(username) {
  const raw = await kvGet(buildStateKey(username));
  if (!raw) return normaliseState();
  try {
    return normaliseState(JSON.parse(raw));
  } catch (error) {
    console.error('api/user-state.readUserState failed to parse stored user state:', error);
    return normaliseState();
  }
}

function buildConflictDetails(currentState, conflictFields = []) {
  return {
    latestState: currentState,
    latestMeta: currentState?._meta || { revision: 0, updatedAt: 0 },
    conflictFields: Array.isArray(conflictFields) ? conflictFields : []
  };
}

function isStaleWrite(currentState, expectedMeta = {}) {
  const currentRevision = Number(currentState?._meta?.revision || 0);
  const expectedRevision = Number(expectedMeta?.revision || 0);
  return currentRevision !== expectedRevision;
}

function buildNextState(current, candidateState) {
  return normaliseState({
    ...candidateState,
    _meta: {
      revision: Number(current?._meta?.revision || 0) + 1,
      updatedAt: Date.now()
    }
  });
}

function applyStatePatch(current, patch = {}) {
  return applyUserWorkspacePatch(current, patch);
}

async function writeUserState(username, state, expectedMeta = {}) {
  const current = await readUserState(username);
  if (isStaleWrite(current, expectedMeta)) {
    return {
      ok: false,
      conflict: true,
      state: current
    };
  }
  const next = buildNextState(current, state);
  await kvSet(buildStateKey(username), JSON.stringify(serializeUserWorkspaceState(next)));
  return {
    ok: true,
    conflict: false,
    state: next
  };
}

async function patchUserState(username, patch, expectedMeta = {}) {
  const current = await readUserState(username);
  if (isStaleWrite(current, expectedMeta)) {
    return {
      ok: false,
      conflict: true,
      state: current
    };
  }
  const patched = applyStatePatch(current, patch);
  const next = buildNextState(current, patched);
  await kvSet(buildStateKey(username), JSON.stringify(serializeUserWorkspaceState(next)));
  return {
    ok: true,
    conflict: false,
    state: next
  };
}


function canAccessUserState(session, username) {
  const safeUsername = String(username || '').trim().toLowerCase();
  return !!session && (session.role === 'admin' || String(session.username || '').trim().toLowerCase() === safeUsername);
}

module.exports = async function handler(req, res) {
  const body = parseRequestBody(req);
  applyCorsHeaders(req, res, {
    methods: 'GET,PUT,PATCH,OPTIONS',
    headers: 'content-type,x-session-token'
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

  if ((req.method === 'PUT' || req.method === 'PATCH') && !req.headers['content-type']?.includes('application/json')) {
    sendApiError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    return;
  }

  if ((req.method === 'PUT' || req.method === 'PATCH') && !isPlainObject(body)) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body.');
    return;
  }

  try {
    const username = String(req.method === 'GET' ? req.query?.username : body.username || '').trim().toLowerCase();
    const session = requireSession(req, res);
    if (!session) return;
    if (!username) {
      sendApiError(res, 400, 'VALIDATION_ERROR', 'Username is required.');
      return;
    }
    if (!canAccessUserState(session, username)) {
      sendApiError(res, 403, 'FORBIDDEN', 'You are not allowed to access this user state.');
      return;
    }

    if (req.method === 'GET') {
      const state = await readUserState(username);
      res.status(200).json({ state });
      return;
    }

    if (req.method === 'PUT') {
      if (getUnexpectedFields(body, ['audit', 'expectedMeta', 'state', 'username']).length) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Unexpected fields were included in the user state request.');
        return;
      }
      const bodyStr = JSON.stringify(body || {});
      if (bodyStr.length > 500000) {
        sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
        return;
      }
      if (!isPlainObject(body.state || {})) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'state payload is required.');
        return;
      }
      const writeResult = await writeUserState(username, body.state || {}, body.expectedMeta || body.state?._meta || {});
      if (writeResult.conflict) {
        sendConflictError(
          res,
          'Your workspace changed in another session. Reload the latest version and try again.',
          buildConflictDetails(writeResult.state)
        );
        return;
      }
      const state = writeResult.state;
      if (body.audit && session) {
        await appendAuditEvent({
          category: body.audit.category || 'user_state',
          eventType: body.audit.eventType || 'user_state_updated',
          actorUsername: session.username,
          actorRole: session.role || 'user',
          target: body.audit.target || username,
          status: 'success',
          source: 'server',
          details: body.audit.details || {}
        });
      }
      res.status(200).json({ state });
      return;
    }

    if (req.method === 'PATCH') {
      if (getUnexpectedFields(body, ['audit', 'expectedMeta', 'patch', 'username']).length) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Unexpected fields were included in the user state patch.');
        return;
      }
      const bodyStr = JSON.stringify(body || {});
      if (bodyStr.length > 500000) {
        sendApiError(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body too large');
        return;
      }
      if (!isPlainObject(body.patch || {})) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'patch payload is required.');
        return;
      }
      const patch = body.patch && typeof body.patch === 'object' ? body.patch : {};
      const writeResult = await patchUserState(username, patch, body.expectedMeta || {});
      if (writeResult.conflict) {
        sendConflictError(
          res,
          'Your workspace changed in another session. Reload the latest version and try again.',
          buildConflictDetails(writeResult.state, Object.keys(patch))
        );
        return;
      }
      const state = writeResult.state;
      if (body.audit && session) {
        await appendAuditEvent({
          category: body.audit.category || 'user_state',
          eventType: body.audit.eventType || 'user_state_updated',
          actorUsername: session.username,
          actorRole: session.role || 'user',
          target: body.audit.target || username,
          status: 'success',
          source: 'server',
          details: body.audit.details || {}
        });
      }
      res.status(200).json({ state });
      return;
    }

    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  } catch (error) {
    console.error('User-state API request failed.', error);
    sendApiError(res, 500, 'USER_STATE_REQUEST_FAILED', 'The user-state request could not be completed.');
  }
};

module.exports.normaliseState = normaliseState;
module.exports.writeUserState = writeUserState;
module.exports.patchUserState = patchUserState;
