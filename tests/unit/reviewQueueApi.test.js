'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const kvStore = new Map();
const originalFetch = global.fetch;

process.env.KV_REST_API_URL = 'https://example.test/kv';
process.env.KV_REST_API_TOKEN = 'test-token';
process.env.SESSION_SIGNING_SECRET = 'review-queue-test-secret';

global.fetch = async (_url, options = {}) => {
  const body = JSON.parse(String(options.body || '[]'));
  const [command, key, value] = body;
  if (command === 'GET') {
    return {
      ok: true,
      json: async () => ({ result: kvStore.has(key) ? kvStore.get(key) : null })
    };
  }
  if (command === 'SET') {
    kvStore.set(key, value);
    return {
      ok: true,
      json: async () => ({ result: 'OK' })
    };
  }
  if (command === 'DEL') {
    kvStore.delete(key);
    return {
      ok: true,
      json: async () => ({ result: 1 })
    };
  }
  throw new Error(`Unsupported KV command: ${command}`);
};

const handler = require('../../api/review-queue');

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
    end() {
      return this;
    }
  };
}

test.beforeEach(() => {
  kvStore.clear();
  kvStore.set('risk_calculator_users', JSON.stringify([
    {
      username: 'analyst',
      displayName: 'Analyst',
      role: 'user',
      businessUnitEntityId: 'g42',
      departmentEntityId: 'technology',
      sessionVersion: 1
    },
    {
      username: 'bu-admin',
      displayName: 'BU Admin',
      role: 'bu_admin',
      businessUnitEntityId: 'g42',
      departmentEntityId: '',
      sessionVersion: 1
    },
    {
      username: 'other-bu-admin',
      displayName: 'Other BU Admin',
      role: 'bu_admin',
      businessUnitEntityId: 'other-bu',
      departmentEntityId: '',
      sessionVersion: 1
    },
    {
      username: 'function-admin',
      displayName: 'Function Admin',
      role: 'function_admin',
      businessUnitEntityId: 'g42',
      departmentEntityId: 'technology',
      sessionVersion: 1
    }
  ]));
});

test.after(() => {
  global.fetch = originalFetch;
});

test('review queue submission uses the session actor instead of trusting submittedBy from the client body', async () => {
  const token = buildSessionToken({
    username: 'analyst',
    role: 'user',
    businessUnitEntityId: 'g42',
    departmentEntityId: 'technology',
    sv: 1,
    exp: Date.now() + 60_000
  });
  const postRes = createRes();
  await handler({
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-session-token': token
    },
    body: {
      assessment: {
        id: 'assessment-1',
        submittedBy: 'impersonated-user',
        buId: 'wrong-bu',
        scenarioTitle: 'Tolerance breach',
        results: {
          toleranceBreached: true
        }
      }
    }
  }, postRes);

  assert.equal(postRes.statusCode, 200);
  assert.equal(postRes.payload.item.submittedBy, 'analyst');
  assert.equal(postRes.payload.item.buId, 'g42');
  assert.equal(postRes.payload.item.departmentEntityId, 'technology');
});

test('review queue GET and PATCH are scoped to the admin actor ownership boundary', async () => {
  kvStore.set('risk_calculator_review_queue', JSON.stringify([
    {
      id: 'rq-1',
      assessmentId: 'a-1',
      submittedBy: 'analyst',
      submittedAt: Date.now(),
      buId: 'g42',
      buName: 'G42',
      departmentEntityId: 'technology',
      scenarioTitle: 'In-scope review',
      reviewStatus: 'pending'
    },
    {
      id: 'rq-2',
      assessmentId: 'a-2',
      submittedBy: 'analyst',
      submittedAt: Date.now(),
      buId: 'other-bu',
      buName: 'Other',
      departmentEntityId: 'finance',
      scenarioTitle: 'Out-of-scope review',
      reviewStatus: 'pending'
    }
  ]));

  const functionAdminToken = buildSessionToken({
    username: 'function-admin',
    role: 'function_admin',
    businessUnitEntityId: 'g42',
    departmentEntityId: 'technology',
    sv: 1,
    exp: Date.now() + 60_000
  });
  const getRes = createRes();
  await handler({
    method: 'GET',
    headers: {
      'x-session-token': functionAdminToken
    }
  }, getRes);

  assert.equal(getRes.statusCode, 200);
  assert.deepEqual(Array.from(getRes.payload.items, item => item.id), ['rq-1']);

  const forbiddenPatchRes = createRes();
  await handler({
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-session-token': functionAdminToken
    },
    body: {
      id: 'rq-2',
      reviewStatus: 'approved'
    }
  }, forbiddenPatchRes);
  assert.equal(forbiddenPatchRes.statusCode, 403);

  const buAdminToken = buildSessionToken({
    username: 'bu-admin',
    role: 'bu_admin',
    businessUnitEntityId: 'g42',
    sv: 1,
    exp: Date.now() + 60_000
  });
  const patchRes = createRes();
  await handler({
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      'x-session-token': buAdminToken
    },
    body: {
      id: 'rq-1',
      reviewStatus: 'approved'
    }
  }, patchRes);

  assert.equal(patchRes.statusCode, 200);
  assert.equal(patchRes.payload.item.reviewedBy, 'bu-admin');
});
