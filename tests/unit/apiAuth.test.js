'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const { validatePasswordPolicy, generateStrongPassword } = require('../../api/_passwordPolicy');
const { buildErrorPayload } = require('../../api/_apiAuth');
const { parseSessionToken } = require('../../api/_audit');

test('validatePasswordPolicy rejects weak passwords and accepts generated passwords', () => {
  const weak = validatePasswordPolicy('weakpass');
  assert.equal(weak.valid, false);
  assert.ok(weak.issues.length >= 1);

  const strong = validatePasswordPolicy(generateStrongPassword());
  assert.equal(strong.valid, true);
  assert.deepEqual(strong.issues, []);
});

test('buildErrorPayload returns the safe API error schema', () => {
  const payload = buildErrorPayload('SESSION_EXPIRED', 'Your session expired. Please sign in again.', { retryAfterSeconds: 60 });
  assert.deepEqual(payload, {
    error: {
      code: 'SESSION_EXPIRED',
      message: 'Your session expired. Please sign in again.'
    },
    retryAfterSeconds: 60
  });
});

test('parseSessionToken accepts valid signed tokens and rejects tampering', () => {
  const originalSecret = process.env.SESSION_SIGNING_SECRET;
  process.env.SESSION_SIGNING_SECRET = 'unit-test-signing-secret';
  try {
    const payload = {
      username: 'alex',
      role: 'admin',
      exp: Date.now() + 60_000
    };
    const payloadPart = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', process.env.SESSION_SIGNING_SECRET).update(payloadPart).digest('base64url');
    const token = `${payloadPart}.${signature}`;
    const parsed = parseSessionToken(token);
    assert.equal(parsed.valid, true);
    assert.equal(parsed.payload.username, 'alex');

    const tampered = parseSessionToken(`${payloadPart}.tampered`);
    assert.equal(tampered.valid, false);
    assert.equal(tampered.reason, 'invalid');
  } finally {
    if (typeof originalSecret === 'string') process.env.SESSION_SIGNING_SECRET = originalSecret;
    else delete process.env.SESSION_SIGNING_SECRET;
  }
});
