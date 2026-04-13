'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { resetWorkflowReuseState } = require('../../api/_workflowReuse');

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

function buildLlmResponse(payload) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify(payload)
          }
        }
      ]
    })
  };
}

test.afterEach(() => {
  restoreEnv();
  global.fetch = originalFetch;
  resetWorkflowReuseState();
});

test('vendor-assessment-analysis route falls back deterministically when hosted AI is unavailable', async () => {
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
    throw new Error(`Unexpected fetch in vendor-assessment-analysis fallback test: ${url}`);
  };

  const handler = loadFresh('../../api/ai/vendor-assessment-analysis');
  const token = buildSessionToken({
    username: 'analyst',
    role: 'user',
    exp: Date.now() + 60_000
  });
  const res = createRes();

  await handler({
    method: 'POST',
    body: JSON.stringify({
      vendorName: 'Acme AI',
      contractDescription: 'GenAI assistant platform for internal knowledge search',
      serviceScope: 'Hosted AI platform with model-based search and answer generation',
      scenarioSummary: 'Customer data will be processed by an AI-enabled hosted service with external subprocessors.',
      dataAccessRequired: true,
      dataTypes: ['PII'],
      headquartered: 'UAE',
      hostingRegion: 'Germany',
      subprocessors: [{ name: 'CloudHost', location: 'Germany' }],
      requiredClauses: ['Governance of GenAI tool usage', 'Cloud hosting and location change management'],
      existingContractClauses: ['Background checks and security training']
    }),
    headers: {
      origin: 'https://slackspac3.github.io',
      'x-session-token': token
    },
    socket: { remoteAddress: '127.0.0.1' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.mode, 'deterministic_fallback');
  assert.equal(res.payload.serviceType, 'ai');
  assert.equal(res.payload.criticalityTier, 'tier_1_critical');
  assert.deepEqual(res.payload.recommendedClausePackIds, ['baseline_security', 'ai_usage', 'data_transfer_and_subprocessors']);
  assert.equal(res.payload.riskControlCheckpoint.checkpoint, 'agreement_with_risk_statement_and_must_have_controls');
  assert.equal(res.payload.requiredClauseCoverage[0].status, 'missing');
});

test('vendor-assessment-analysis route uses server-side Compass analysis when hosted AI is configured', async () => {
  process.env.ALLOWED_ORIGIN = 'https://slackspac3.github.io';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.COMPASS_API_URL = 'https://example.test/ai';
  process.env.COMPASS_API_KEY = 'proxy-secret';
  process.env.COMPASS_MODEL = 'gpt-5.4';
  const providerBodies = [];

  global.fetch = async (url, options = {}) => {
    if (String(url).includes('/kv')) {
      return {
        ok: true,
        json: async () => ({ result: null })
      };
    }
    if (String(url) === 'https://example.test/ai') {
      providerBodies.push(JSON.parse(options.body));
      return buildLlmResponse({
        summaryStatement: 'The vendor operates a hosted SaaS service with cross-border subprocessors, so stronger contract controls and a Tier 2 Important posture are warranted.',
        serviceType: 'saas',
        criticalityTier: 'tier_2_important',
        criticalityRationale: 'The service is SaaS, processes finance-related data, and depends on cross-border hosting and subprocessors.',
        regulatoryImpact: ['financial', 'cross_border_and_residency'],
        recommendedClausePackIds: ['baseline_security', 'saas_hosting', 'data_transfer_and_subprocessors'],
        requiredClauseCoverage: [
          {
            clause: 'Cloud hosting and location change management',
            status: 'covered',
            reason: 'A matching hosting-location clause is present in the supplied draft.'
          },
          {
            clause: 'Logging, monitoring, and remote access controls',
            status: 'missing',
            reason: 'The supplied draft does not clearly cover logging retention and forensic support.'
          }
        ],
        riskStatements: [
          {
            title: 'Cross-border SaaS hosting and subprocessor dependency',
            statement: 'Cross-border hosting and downstream subprocessors may create regulatory and control risk if not governed by explicit contractual safeguards.',
            likelihood: 'medium',
            impact: 'high',
            mitigation: 'Apply hosting, subprocessor, and monitoring clauses and verify evidence before approval.'
          }
        ],
        recommendations: [
          'Keep the case in the SaaS review lane.',
          'Add the missing monitoring and forensic-support clauses before contract finalisation.'
        ]
      });
    }
    throw new Error(`Unexpected fetch in vendor-assessment-analysis live test: ${url}`);
  };

  const handler = loadFresh('../../api/ai/vendor-assessment-analysis');
  const token = buildSessionToken({
    username: 'analyst',
    role: 'user',
    exp: Date.now() + 60_000
  });
  const res = createRes();

  await handler({
    method: 'POST',
    body: JSON.stringify({
      vendorName: 'Contoso Cloud',
      contractDescription: 'Hosted SaaS analytics platform',
      serviceScope: 'SaaS service for finance and reporting workflows',
      scenarioSummary: 'Finance data is processed in a hosted service with a downstream cloud host.',
      dataAccessRequired: true,
      dataTypes: ['Finance_Details'],
      headquartered: 'UAE',
      hostingRegion: 'Germany',
      subprocessors: [{ name: 'CloudHost', location: 'Germany' }],
      requiredClauses: [
        'Cloud hosting and location change management',
        'Logging, monitoring, and remote access controls'
      ],
      existingContractClauses: [
        'Cloud hosting and location change management',
        'Background checks and security training'
      ]
    }),
    headers: {
      origin: 'https://slackspac3.github.io',
      'x-session-token': token
    },
    socket: { remoteAddress: '127.0.0.1' }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.mode, 'live');
  assert.equal(res.payload.serviceType, 'saas');
  assert.equal(res.payload.criticalityTier, 'tier_2_important');
  assert.deepEqual(res.payload.recommendedClausePackIds, ['baseline_security', 'saas_hosting', 'data_transfer_and_subprocessors']);
  assert.equal(res.payload.requiredClauseCoverage[0].status, 'covered');
  assert.equal(res.payload.requiredClauseCoverage[1].status, 'missing');
  assert.equal(providerBodies.length, 1);
  const systemPrompt = String(providerBodies[0]?.messages?.[0]?.content || '');
  const userPrompt = String(providerBodies[0]?.messages?.[1]?.content || '');
  assert.match(systemPrompt, /group technology risk analyst/i);
  assert.match(userPrompt, /Required clauses to check against:/);
  assert.match(userPrompt, /Existing contract clauses:/);
  assert.match(userPrompt, /Deterministic baseline analysis:/);
});
