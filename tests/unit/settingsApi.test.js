'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const originalEnv = {
  ADMIN_API_SECRET: process.env.ADMIN_API_SECRET,
  KV_REST_API_URL: process.env.KV_REST_API_URL,
  KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
  SESSION_SIGNING_SECRET: process.env.SESSION_SIGNING_SECRET
};
const originalFetch = global.fetch;
const kvStore = new Map();

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
    end() {
      return this;
    }
  };
}

function loadFreshSettingsHandler() {
  delete require.cache[require.resolve('../../api/settings')];
  return require('../../api/settings');
}

test.beforeEach(() => {
  kvStore.clear();
  process.env.ADMIN_API_SECRET = 'test-admin-secret';
  process.env.KV_REST_API_URL = 'https://example.test/kv';
  process.env.KV_REST_API_TOKEN = 'test-token';
  process.env.SESSION_SIGNING_SECRET = 'test-signing-secret';
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
    throw new Error(`Unsupported KV command: ${command}`);
  };
});

test.afterEach(() => {
  restoreEnv();
  global.fetch = originalFetch;
  kvStore.clear();
});

test('settings GET requires authentication when no admin secret is provided', async () => {
  const handler = loadFreshSettingsHandler();
  const res = createRes();

  await handler({
    method: 'GET',
    headers: {}
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.payload?.error?.code, 'AUTH_REQUIRED');
});

test('settings GET returns settings for authenticated non-admin users without storage metadata', async () => {
  kvStore.set('risk_calculator_settings', JSON.stringify({
    geography: 'United Kingdom',
    companyContextProfile: 'Private profile',
    _meta: { revision: 2, updatedAt: 1710000000000 }
  }));
  const handler = loadFreshSettingsHandler();
  const res = createRes();
  const token = buildSessionToken({
    username: 'analyst',
    role: 'user',
    exp: Date.now() + 60_000
  });

  await handler({
    method: 'GET',
    headers: {
      'x-session-token': token
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.settings?.geography, 'United Kingdom');
  assert.equal(res.payload?.settings?.companyContextProfile, '');
  assert.equal(res.payload?.scope?.role, 'user');
  assert.equal(Object.prototype.hasOwnProperty.call(res.payload || {}, 'storage'), false);
});

test('settings GET allows admin-secret access and includes storage metadata', async () => {
  const handler = loadFreshSettingsHandler();
  const res = createRes();

  await handler({
    method: 'GET',
    headers: {
      'x-admin-secret': 'test-admin-secret'
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.storage?.writable, true);
  assert.equal(res.payload?.storage?.mode, 'shared-kv');
});

test('settings GET normalises shared context review metadata for company, entity, and layer context', async () => {
  kvStore.set('risk_calculator_settings', JSON.stringify({
    companyContextProfile: 'Reviewed company context',
    companyContextMeta: {
      status: 'reviewed',
      source: 'ai',
      generatedAt: 1710000000000,
      reviewedAt: 1710003600000,
      reviewDueAt: 1717779600000,
      sourceUrl: 'https://example.com'
    },
    companyStructure: [
      {
        id: 'corp-a',
        type: 'Holding company',
        name: 'Corp A',
        profile: 'Entity profile',
        contextMeta: {
          status: 'draft',
          source: 'ai',
          generatedAt: 1710000000000
        }
      }
    ],
    entityContextLayers: [
      {
        entityId: 'corp-a',
        entityName: 'Corp A',
        contextSummary: 'Layer summary',
        contextMeta: {
          status: 'fallback',
          source: 'ai',
          fallbackUsed: true,
          generatedAt: 1710000000000
        }
      }
    ],
    _meta: { revision: 2, updatedAt: 1710000000000 }
  }));
  const handler = loadFreshSettingsHandler();
  const res = createRes();

  await handler({
    method: 'GET',
    headers: {
      'x-admin-secret': 'test-admin-secret'
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.settings?.companyContextMeta?.status, 'reviewed');
  assert.equal(res.payload?.settings?.companyContextMeta?.source, 'ai');
  assert.equal(res.payload?.settings?.companyStructure?.[0]?.contextMeta?.status, 'draft');
  assert.equal(res.payload?.settings?.entityContextLayers?.[0]?.contextMeta?.status, 'fallback');
  assert.equal(res.payload?.settings?.entityContextLayers?.[0]?.contextMeta?.fallbackUsed, true);
});

test('settings GET redacts hidden global and out-of-scope context for standard users', async () => {
  kvStore.set('risk_calculator_settings', JSON.stringify({
    geography: 'United Arab Emirates',
    companyContextProfile: 'Global confidential company profile',
    adminContextSummary: 'Hidden global guidance',
    adminContextVisibleToUsers: false,
    companyStructure: [
      { id: 'corp-a', type: 'Holding company', name: 'Corp A', ownerUsername: 'owner-a', profile: 'Corp A private profile', websiteUrl: 'https://corp-a.example' },
      { id: 'dept-a1', parentId: 'corp-a', type: 'Department / function', name: 'Technology', ownerUsername: 'lead-tech', profile: 'Technology private profile' },
      { id: 'corp-b', type: 'Holding company', name: 'Corp B', ownerUsername: 'owner-b', profile: 'Corp B private profile' },
      { id: 'dept-b1', parentId: 'corp-b', type: 'Department / function', name: 'Finance', ownerUsername: 'lead-fin', profile: 'Finance private profile' }
    ],
    entityContextLayers: [
      { entityId: 'corp-a', entityName: 'Corp A', geography: 'UAE', contextSummary: 'Hidden BU summary', aiInstructions: 'Hidden BU AI', visibleToChildUsers: false, applicableRegulations: ['UAE PDPL'] },
      { entityId: 'dept-a1', entityName: 'Technology', geography: 'UAE', contextSummary: 'Visible function summary', aiInstructions: 'Visible function AI', visibleToChildUsers: true, applicableRegulations: ['ISO 27001'] },
      { entityId: 'corp-b', entityName: 'Corp B', geography: 'UK', contextSummary: 'Other company summary', aiInstructions: 'Other company AI', visibleToChildUsers: true, applicableRegulations: ['UK GDPR'] }
    ],
    entityObligations: [
      { sourceEntityId: 'corp-a', title: 'Hidden obligation', familyKey: 'hidden-obligation', visibleToChildUsers: false, flowDownMode: 'none' },
      { sourceEntityId: 'dept-a1', title: 'Visible obligation', familyKey: 'visible-obligation', visibleToChildUsers: true, flowDownMode: 'none' },
      { sourceEntityId: 'corp-b', title: 'Other obligation', familyKey: 'other-obligation', visibleToChildUsers: true, flowDownMode: 'none' }
    ],
    buOverrides: [
      { id: 'corp-a', orgEntityId: 'corp-a', name: 'Corp A BU', contextSummary: 'Hidden override summary', contextVisibleToUsers: false, regulatoryTags: ['UAE PDPL'] },
      { id: 'corp-b', orgEntityId: 'corp-b', name: 'Corp B BU', contextSummary: 'Other override summary', contextVisibleToUsers: true, regulatoryTags: ['UK GDPR'] }
    ],
    _meta: { revision: 3, updatedAt: 1710000000000 }
  }));
  const handler = loadFreshSettingsHandler();
  const res = createRes();
  const token = buildSessionToken({
    username: 'analyst',
    role: 'user',
    businessUnitEntityId: 'corp-a',
    departmentEntityId: 'dept-a1',
    exp: Date.now() + 60_000
  });

  await handler({
    method: 'GET',
    headers: {
      'x-session-token': token
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.scope?.role, 'user');
  assert.equal(res.payload?.scope?.redacted, true);
  assert.equal(res.payload?.settings?.companyContextProfile, '');
  assert.equal(res.payload?.settings?.adminContextSummary, '');
  assert.deepEqual(
    (res.payload?.settings?.companyStructure || []).map(node => node.id),
    ['corp-a', 'dept-a1']
  );
  assert.equal(res.payload?.settings?.companyStructure?.[0]?.profile, '');
  assert.equal(res.payload?.settings?.companyStructure?.[0]?.ownerUsername, '');
  assert.deepEqual(
    (res.payload?.settings?.entityContextLayers || []).map(layer => ({
      entityId: layer.entityId,
      contextSummary: layer.contextSummary || '',
      aiInstructions: layer.aiInstructions || ''
    })),
    [
      { entityId: 'corp-a', contextSummary: '', aiInstructions: '' },
      { entityId: 'dept-a1', contextSummary: 'Visible function summary', aiInstructions: 'Visible function AI' }
    ]
  );
  assert.deepEqual(
    (res.payload?.settings?.entityObligations || []).map(item => item.title),
    ['Visible obligation']
  );
  assert.deepEqual(
    (res.payload?.settings?.buOverrides || []).map(item => ({
      orgEntityId: item.orgEntityId,
      contextSummary: item.contextSummary || ''
    })),
    [{ orgEntityId: 'corp-a', contextSummary: '' }]
  );
});

test('settings GET keeps a BU admin scoped to the managed business-unit slice', async () => {
  kvStore.set('risk_calculator_settings', JSON.stringify({
    geography: 'United Arab Emirates',
    adminContextSummary: 'Managed context',
    adminContextVisibleToUsers: false,
    companyStructure: [
      { id: 'corp-a', type: 'Holding company', name: 'Corp A', ownerUsername: 'bu-admin', profile: 'Corp A private profile' },
      { id: 'dept-a1', parentId: 'corp-a', type: 'Department / function', name: 'Technology', ownerUsername: 'tech-owner', profile: 'Technology private profile' },
      { id: 'dept-a2', parentId: 'corp-a', type: 'Department / function', name: 'Operations', ownerUsername: 'ops-owner', profile: 'Operations private profile' },
      { id: 'corp-b', type: 'Holding company', name: 'Corp B', ownerUsername: 'owner-b', profile: 'Corp B private profile' }
    ],
    entityContextLayers: [
      { entityId: 'corp-a', entityName: 'Corp A', geography: 'UAE', contextSummary: 'Managed BU summary', aiInstructions: 'Managed BU AI', visibleToChildUsers: false, applicableRegulations: ['UAE PDPL'] },
      { entityId: 'dept-a1', entityName: 'Technology', geography: 'UAE', contextSummary: 'Managed function summary', aiInstructions: 'Managed function AI', visibleToChildUsers: false, applicableRegulations: ['ISO 27001'] },
      { entityId: 'corp-b', entityName: 'Corp B', geography: 'UK', contextSummary: 'Other BU summary', aiInstructions: 'Other BU AI', visibleToChildUsers: true, applicableRegulations: ['UK GDPR'] }
    ],
    _meta: { revision: 4, updatedAt: 1710000000000 }
  }));
  const handler = loadFreshSettingsHandler();
  const res = createRes();
  const token = buildSessionToken({
    username: 'bu-admin',
    role: 'bu_admin',
    businessUnitEntityId: 'corp-a',
    exp: Date.now() + 60_000
  });

  await handler({
    method: 'GET',
    headers: {
      'x-session-token': token
    }
  }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.payload?.scope?.role, 'bu_admin');
  assert.equal(res.payload?.settings?.adminContextSummary, 'Managed context');
  assert.deepEqual(
    (res.payload?.settings?.companyStructure || []).map(node => node.id),
    ['corp-a', 'dept-a1', 'dept-a2']
  );
  assert.equal(res.payload?.settings?.companyStructure?.[0]?.ownerUsername, 'bu-admin');
  assert.deepEqual(
    (res.payload?.settings?.entityContextLayers || []).map(layer => layer.entityId),
    ['corp-a', 'dept-a1']
  );
  assert.equal(res.payload?.settings?.entityContextLayers?.[0]?.contextSummary, 'Managed BU summary');
});
