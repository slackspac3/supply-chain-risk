'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const originalEnv = {
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  SESSION_SIGNING_SECRET: process.env.SESSION_SIGNING_SECRET
};
const originalFetch = global.fetch;

function restoreEnv() {
  Object.entries(originalEnv).forEach(([key, value]) => {
    if (typeof value === 'string') process.env[key] = value;
    else delete process.env[key];
  });
}

function buildSessionToken(payload) {
  const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', process.env.SESSION_SIGNING_SECRET).update(payloadPart).digest('base64url');
  return `${payloadPart}.${signature}`;
}

function createRes() {
  return {
    headers: {},
    statusCode: 0,
    payload: null,
    setHeader(key, value) {
      this.headers[key] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
    end() {
      return this;
    }
  };
}

function buildKvFetch(store) {
  return async (url, options = {}) => {
    if (String(url) !== process.env.KV_REST_API_URL) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }
    const command = JSON.parse(String(options.body || '[]'));
    const [operation, key, value, flagA, flagB] = command;
    if (operation === 'GET') {
      return {
        ok: true,
        json: async () => ({ result: store.has(key) ? store.get(key) : null })
      };
    }
    if (operation === 'SET') {
      const useNx = String(flagA || '').toUpperCase() === 'NX';
      if (useNx && store.has(key)) {
        return {
          ok: true,
          json: async () => ({ result: null })
        };
      }
      store.set(key, value);
      return {
        ok: true,
        json: async () => ({ result: 'OK' })
      };
    }
    if (operation === 'DEL') {
      const existed = store.delete(key);
      return {
        ok: true,
        json: async () => ({ result: existed ? 1 : 0 })
      };
    }
    throw new Error(`Unexpected KV command: ${JSON.stringify(command)}`);
  };
}

function loadFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function loadUsersHandler() {
  [
    '../../api/users',
    '../../api/_apiAuth',
    '../../api/_audit',
    '../../api/_kvStore'
  ].forEach((modulePath) => {
    delete require.cache[require.resolve(modulePath)];
  });
  return require('../../api/users');
}

function loadAuditHandler() {
  [
    '../../api/audit-log',
    '../../api/_apiAuth',
    '../../api/_audit',
    '../../api/_kvStore'
  ].forEach((modulePath) => {
    delete require.cache[require.resolve(modulePath)];
  });
  return require('../../api/audit-log');
}

test.afterEach(() => {
  restoreEnv();
  global.fetch = originalFetch;
});

test('BU admin only receives managed accounts from their own business unit', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  const store = new Map();
  store.set('risk_calculator_users', JSON.stringify([
    { username: 'global.admin', displayName: 'Global Admin', role: 'admin', businessUnitEntityId: '', departmentEntityId: '', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 },
    { username: 'bu.owner', displayName: 'BU Owner', role: 'bu_admin', businessUnitEntityId: 'BU-1', departmentEntityId: '', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 },
    { username: 'finance.user', displayName: 'Finance User', role: 'user', businessUnitEntityId: 'BU-1', departmentEntityId: 'DEP-1', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 },
    { username: 'finance.function', displayName: 'Finance Function', role: 'function_admin', businessUnitEntityId: 'BU-1', departmentEntityId: 'DEP-2', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 },
    { username: 'other.user', displayName: 'Other User', role: 'user', businessUnitEntityId: 'BU-2', departmentEntityId: 'DEP-9', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 },
    { username: 'central.reviewer', displayName: 'Central Reviewer', role: 'reviewer', businessUnitEntityId: '', departmentEntityId: '', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 }
  ]));
  global.fetch = buildKvFetch(store);

  const handler = loadUsersHandler();
  const res = createRes();
  const token = buildSessionToken({
    username: 'bu.owner',
    role: 'bu_admin',
    businessUnitEntityId: 'BU-1',
    sv: 1,
    exp: Date.now() + 60_000
  });

  await handler({
    method: 'GET',
    query: {},
    headers: {
      origin: 'https://slackspac3.github.io',
      'x-session-token': token
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(
    res.payload.accounts.map((account) => account.username).sort(),
    ['bu.owner', 'finance.function', 'finance.user']
  );
});

test('BU admin cannot create central-review accounts or cross-BU users', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  const store = new Map();
  store.set('risk_calculator_users', JSON.stringify([
    { username: 'bu.owner', displayName: 'BU Owner', role: 'bu_admin', businessUnitEntityId: 'BU-1', departmentEntityId: '', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 }
  ]));
  global.fetch = buildKvFetch(store);
  const handler = loadUsersHandler();
  const token = buildSessionToken({
    username: 'bu.owner',
    role: 'bu_admin',
    businessUnitEntityId: 'BU-1',
    sv: 1,
    exp: Date.now() + 60_000
  });

  const centralRoleRes = createRes();
  await handler({
    method: 'POST',
    body: JSON.stringify({
      action: 'create',
      account: {
        username: 'new.analyst',
        displayName: 'New Analyst',
        role: 'gtr_analyst',
        businessUnitEntityId: 'BU-1',
        departmentEntityId: ''
      }
    }),
    headers: {
      origin: 'https://slackspac3.github.io',
      'content-type': 'application/json',
      'x-session-token': token
    }
  }, centralRoleRes);

  assert.equal(centralRoleRes.statusCode, 403);
  assert.match(centralRoleRes.payload.error.message, /BU admins can only create/i);

  const crossBuRes = createRes();
  await handler({
    method: 'POST',
    body: JSON.stringify({
      action: 'create',
      account: {
        username: 'cross.bu',
        displayName: 'Cross BU User',
        role: 'user',
        businessUnitEntityId: 'BU-2',
        departmentEntityId: 'DEP-9'
      }
    }),
    headers: {
      origin: 'https://slackspac3.github.io',
      'content-type': 'application/json',
      'x-session-token': token
    }
  }, crossBuRes);

  assert.equal(crossBuRes.statusCode, 403);
  assert.match(crossBuRes.payload.error.message, /inside their assigned business unit/i);
});

test('BU admin can create vendor contacts inside their own business unit', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  const store = new Map();
  store.set('risk_calculator_users', JSON.stringify([
    { username: 'bu.owner', displayName: 'BU Owner', role: 'bu_admin', businessUnitEntityId: 'BU-1', departmentEntityId: '', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 }
  ]));
  global.fetch = buildKvFetch(store);
  const handler = loadUsersHandler();
  const token = buildSessionToken({
    username: 'bu.owner',
    role: 'bu_admin',
    businessUnitEntityId: 'BU-1',
    sv: 1,
    exp: Date.now() + 60_000
  });
  const res = createRes();

  await handler({
    method: 'POST',
    body: JSON.stringify({
      action: 'create',
      account: {
        username: 'vendor.alpha',
        displayName: 'Vendor Alpha',
        role: 'vendor_contact',
        businessUnitEntityId: 'BU-1',
        departmentEntityId: ''
      }
    }),
    headers: {
      origin: 'https://slackspac3.github.io',
      'content-type': 'application/json',
      'x-session-token': token
    }
  }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(res.payload.account.role, 'vendor_contact');
  assert.equal(res.payload.account.businessUnitEntityId, 'BU-1');
  assert.ok(String(res.payload.password || '').trim().length > 0);
  assert.deepEqual(res.payload.accounts.map((account) => account.username).sort(), ['bu.owner', 'vendor.alpha']);
});

test('BU admin audit log view is limited to their own business unit entries', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  const store = new Map();
  store.set('risk_calculator_users', JSON.stringify([
    { username: 'bu.owner', displayName: 'BU Owner', role: 'bu_admin', businessUnitEntityId: 'BU-1', departmentEntityId: '', passwordHash: 'x', passwordSalt: 'y', sessionVersion: 1 }
  ]));
  store.set('risk_calculator_audit_log', JSON.stringify([
    {
      id: 'evt-1',
      ts: '2026-04-13T10:00:00.000Z',
      category: 'user_admin',
      eventType: 'user_created',
      actorUsername: 'bu.owner',
      actorRole: 'bu_admin',
      target: 'finance.user',
      status: 'success',
      source: 'server',
      details: { businessUnitEntityId: 'BU-1' }
    },
    {
      id: 'evt-2',
      ts: '2026-04-13T11:00:00.000Z',
      category: 'user_admin',
      eventType: 'user_created',
      actorUsername: 'global.admin',
      actorRole: 'admin',
      target: 'other.user',
      status: 'success',
      source: 'server',
      details: { businessUnitEntityId: 'BU-2' }
    },
    {
      id: 'evt-3',
      ts: '2026-04-13T12:00:00.000Z',
      category: 'auth',
      eventType: 'login_success',
      actorUsername: 'finance.user',
      actorRole: 'user',
      target: '',
      status: 'success',
      source: 'server',
      details: { businessUnitEntityId: 'BU-1' }
    }
  ]));
  global.fetch = buildKvFetch(store);
  const handler = loadAuditHandler();
  const token = buildSessionToken({
    username: 'bu.owner',
    role: 'bu_admin',
    businessUnitEntityId: 'BU-1',
    sv: 1,
    exp: Date.now() + 60_000
  });
  const res = createRes();

  await handler({
    method: 'GET',
    headers: {
      origin: 'https://slackspac3.github.io',
      'x-session-token': token
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.scope.type, 'business_unit');
  assert.equal(res.payload.scope.businessUnitEntityId, 'BU-1');
  assert.deepEqual(res.payload.entries.map((entry) => entry.id), ['evt-3', 'evt-1']);
  assert.equal(res.payload.summary.total, 2);
});
