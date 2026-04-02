'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const originalEnv = {
  ALLOWED_ORIGIN: process.env.ALLOWED_ORIGIN,
  COMPASS_API_KEY: process.env.COMPASS_API_KEY,
  COMPASS_API_URL: process.env.COMPASS_API_URL,
  COMPASS_MODEL: process.env.COMPASS_MODEL,
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

test('scenario-draft route returns deterministic server fallback when hosted AI proxy is not configured', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  global.fetch = async (url) => {
    if (String(url).includes('/kv')) {
      return {
        ok: true,
        json: async () => ({ result: null })
      };
    }
    throw new Error(`Unexpected fetch in fallback scenario-draft test: ${url}`);
  };

  const handler = loadFresh('../../api/ai/scenario-draft');
  const token = buildSessionToken({
    username: 'analyst',
    role: 'user',
    exp: Date.now() + 60_000
  });
  const res = createRes();

  await handler({
    method: 'POST',
    body: JSON.stringify({
      riskStatement: 'Azure global admin credentials found on the dark web.'
    }),
    headers: {
      origin: 'https://slackspac3.github.io',
      'x-session-token': token
    },
    socket: { remoteAddress: '127.0.0.1' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.mode, 'deterministic_fallback');
  assert.equal(res.payload.usedFallback, true);
  assert.equal(res.payload.aiUnavailable, true);
  assert.equal(res.payload.draftNarrativeSource, 'fallback');
  assert.equal(typeof res.payload.draftNarrative, 'string');
  assert.equal(String(res.payload.trace?.label || ''), 'Step 1 guided draft');
});

test('scenario-draft route orchestrates live generation and quality-gate server-side for Step 1 guided draft', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.COMPASS_API_KEY = 'proxy-secret';
  process.env.COMPASS_MODEL = 'gpt-5.1';

  const aiPayload = JSON.stringify({
    draftNarrative: 'Azure global admin credentials found on the dark web are being used to access the tenant, escalate privileges, and modify critical controls.',
    summary: 'The scenario stays in the identity compromise lane.',
    linkAnalysis: 'The main chain is identity compromise, privileged escalation, and downstream disruption or fraud.',
    workflowGuidance: [
      'Confirm the scope of the compromised admin identity.',
      'Keep only the risks that share the same identity compromise path.'
    ],
    benchmarkBasis: 'Prefer identity-control and privileged-access comparators from GCC and global enterprise peers.',
    scenarioLens: {
      key: 'identity',
      label: 'Cyber',
      functionKey: 'technology',
      estimatePresetKey: 'identity',
      secondaryKeys: []
    },
    structuredScenario: {
      assetService: 'Azure tenant administration',
      primaryDriver: 'Credential theft and account takeover',
      eventPath: 'Privileged credential abuse to access the tenant',
      effect: 'Privilege misuse, disruption, and exposure'
    },
    risks: [
      {
        title: 'Privileged account takeover through exposed admin credentials',
        category: 'Identity & Access',
        description: 'Exposed global admin credentials could enable privilege escalation and control changes across the tenant.',
        confidence: 'high',
        regulations: ['ISO 27001']
      }
    ]
  });

  global.fetch = async (url) => {
    if (String(url).includes('/kv')) {
      return {
        ok: true,
        json: async () => ({ result: null })
      };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: aiPayload
            }
          }
        ]
      }),
      text: async () => aiPayload
    };
  };

  const handler = loadFresh('../../api/ai/scenario-draft');
  const token = buildSessionToken({
    username: 'analyst',
    role: 'user',
    exp: Date.now() + 60_000
  });
  const res = createRes();

  await handler({
    method: 'POST',
    body: JSON.stringify({
      riskStatement: 'Azure global admin credentials found on the dark web.',
      guidedInput: {
        event: 'Azure global admin credentials found on the dark web.',
        impact: 'Control disruption and fraud exposure'
      },
      traceLabel: 'Step 1 guided draft'
    }),
    headers: {
      origin: 'https://slackspac3.github.io',
      'x-session-token': token
    },
    socket: { remoteAddress: '127.0.0.1' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.mode, 'live');
  assert.equal(res.payload.usedFallback, false);
  assert.equal(res.payload.aiUnavailable, false);
  assert.equal(res.payload.scenarioLens?.key, 'identity');
  assert.match(String(res.payload.draftNarrative || ''), /global admin credentials/i);
  assert.equal(String(res.payload.trace?.label || ''), 'Step 1 guided draft');
});
