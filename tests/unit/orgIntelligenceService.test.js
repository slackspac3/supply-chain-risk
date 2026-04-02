'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createMemoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  return {
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    }
  };
}

function loadOrgIntelligenceService({ origin = 'https://slackspac3.github.io', fetchImpl } = {}) {
  const filePath = path.resolve(__dirname, '../../assets/services/orgIntelligenceService.js');
  const source = `${fs.readFileSync(filePath, 'utf8')}\nmodule.exports = OrgIntelligenceService;\n`;
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    localStorage: createMemoryStorage(),
    window: {
      location: { origin }
    },
    AuthService: {
      getApiSessionToken() {
        return 'session-token';
      },
      getCurrentUser() {
        return { username: 'alex' };
      }
    },
    fetch: fetchImpl
  };
  context.global = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: filePath });
  return context.module.exports;
}

test('OrgIntelligenceService uses the Vercel API origin outside vercel.app for shared feedback writes', async () => {
  const calls = [];
  const service = loadOrgIntelligenceService({
    origin: 'https://slackspac3.github.io',
    fetchImpl: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({ ok: true, feedback: { updatedAt: Date.now(), events: [] } }),
        text: async () => JSON.stringify({ ok: true, feedback: { updatedAt: Date.now(), events: [] } })
      };
    }
  });

  await service.recordAiFeedback({
    target: 'draft',
    score: 4,
    runtimeMode: 'live_ai',
    buId: 'g42',
    functionKey: 'technology',
    lensKey: 'cyber'
  });

  assert.equal(calls[0], 'https://risk-calculator-eight.vercel.app/api/org-intelligence');
});

test('OrgIntelligenceService uses the Vercel API origin outside vercel.app for shared feedback reads', async () => {
  const calls = [];
  const service = loadOrgIntelligenceService({
    origin: 'https://slackspac3.github.io',
    fetchImpl: async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        json: async () => ({
          patterns: [],
          calibration: { updatedAt: 0, scenarioTypes: {} },
          decisions: [],
          coverageMap: { updatedAt: 0, scenarioTypes: {} },
          feedback: { updatedAt: Date.now(), events: [] }
        }),
        text: async () => JSON.stringify({
          patterns: [],
          calibration: { updatedAt: 0, scenarioTypes: {} },
          decisions: [],
          coverageMap: { updatedAt: 0, scenarioTypes: {} },
          feedback: { updatedAt: Date.now(), events: [] }
        })
      };
    }
  });

  await service.refresh(true);

  assert.equal(calls[0], 'https://risk-calculator-eight.vercel.app/api/org-intelligence');
});
