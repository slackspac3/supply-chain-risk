'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const originalEnv = {
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
  COMPASS_API_KEY: process.env.COMPASS_API_KEY,
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

function loadFresh(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

test.afterEach(() => {
  restoreEnv();
  global.fetch = originalFetch;
});

test('compass handler fails closed when the rate-limit store is unavailable', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.COMPASS_API_KEY = 'test-key';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  global.fetch = async () => {
    throw new Error('kv offline');
  };

  const handler = loadFresh('../../api/compass');
  const token = buildSessionToken({
    username: 'alex',
    role: 'user',
    exp: Date.now() + 60_000
  });
  const res = createRes();

  await handler({
    method: 'POST',
    headers: {
      origin: 'https://slackspac3.github.io',
      'content-type': 'application/json',
      'x-session-token': token
    },
    socket: { remoteAddress: '127.0.0.1' },
    body: { messages: [{ role: 'user', content: 'Hello' }] }
  }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error, 'Request throttling is temporarily unavailable');
});

test('compass handler rejects disallowed origins before upstream work', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.COMPASS_API_KEY = 'test-key';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  global.fetch = async () => {
    throw new Error('fetch should not run for blocked origins');
  };

  const handler = loadFresh('../../api/compass');
  const token = buildSessionToken({
    username: 'alex',
    role: 'user',
    exp: Date.now() + 60_000
  });
  const res = createRes();

  await handler({
    method: 'POST',
    headers: {
      origin: 'https://evil.example',
      'content-type': 'application/json',
      'x-session-token': token
    },
    socket: { remoteAddress: '127.0.0.1' },
    body: { messages: [{ role: 'user', content: 'Hello' }] }
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.error, 'Origin not allowed');
});

test('users login fails closed when the throttle store is unavailable', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  global.fetch = async () => {
    throw new Error('kv offline');
  };

  const handler = loadFresh('../../api/users');
  const res = createRes();

  await handler({
    method: 'POST',
    headers: {
      origin: 'https://slackspac3.github.io',
      'content-type': 'application/json'
    },
    socket: { remoteAddress: '127.0.0.1' },
    body: {
      action: 'login',
      username: 'alex',
      password: 'Password!123'
    }
  }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.payload.error.code, 'RATE_LIMIT_UNAVAILABLE');
});

test('users login rejects unexpected fields in the request body', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  const handler = loadFresh('../../api/users');
  const res = createRes();

  await handler({
    method: 'POST',
    headers: {
      origin: 'https://slackspac3.github.io',
      'content-type': 'application/json'
    },
    socket: { remoteAddress: '127.0.0.1' },
    body: {
      action: 'login',
      username: 'alex',
      password: 'Password!123',
      role: 'admin'
    }
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.payload.error.code, 'VALIDATION_ERROR');
});

test('timing-safe admin secret helper accepts only exact matches', () => {
  const { isRequestSecretValid } = loadFresh('../../api/_apiAuth');
  assert.equal(isRequestSecretValid({ headers: { 'x-admin-secret': 'pilot-secret' } }, 'x-admin-secret', 'pilot-secret'), true);
  assert.equal(isRequestSecretValid({ headers: { 'x-admin-secret': 'pilot-secret ' } }, 'x-admin-secret', 'pilot-secret'), true);
  assert.equal(isRequestSecretValid({ headers: { 'x-admin-secret': 'pilot-secret-nope' } }, 'x-admin-secret', 'pilot-secret'), false);
  assert.equal(isRequestSecretValid({ headers: {} }, 'x-admin-secret', 'pilot-secret'), false);
});
