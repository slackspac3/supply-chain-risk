'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadService({ origin = 'https://slackspac3.github.io', fetchImpl } = {}) {
  const filePath = path.resolve(__dirname, '../../assets/services/llmService.js');
  const source = `${fs.readFileSync(filePath, 'utf8')}\n;globalThis.__llmService = LLMService;`;
  const noopStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    setTimeout,
    clearTimeout,
    AbortController,
    sessionStorage: noopStorage,
    localStorage: noopStorage,
    window: {
      location: { origin, hostname: new URL(origin).hostname },
      _lastRagSources: []
    },
    fetch: fetchImpl,
    AuthService: {
      getApiSessionToken: () => 'session-token'
    },
    AIGuardrails: null,
    BenchmarkService: {},
    logAuditEvent: async () => {}
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'llmService.js' });
  return context.__llmService;
}

test('buildGuidedScenarioDraft uses the server scenario-draft endpoint and stores returned trace in runtime memory', async () => {
  const fetchCalls = [];
  const service = loadService({
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({
          mode: 'live',
          draftNarrative: 'High-urgency Cyber scenario: Azure global admin credentials found on the dark web are being used to access the tenant.',
          scenarioLens: {
            key: 'identity',
            label: 'Cyber',
            functionKey: 'technology',
            estimatePresetKey: 'identity',
            secondaryKeys: []
          },
          trace: {
            label: 'Step 1 guided draft',
            promptSummary: 'Server prompt summary',
            response: 'Server returned guided draft',
            sources: [
              {
                title: 'Identity reference',
                url: 'https://example.com/source'
              }
            ]
          }
        })
      };
    }
  });

  const result = await service.buildGuidedScenarioDraft({
    riskStatement: 'Azure global admin credentials found on the dark web.',
    guidedInput: { event: 'Azure global admin credentials found on the dark web.' },
    traceLabel: 'Step 1 guided draft'
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://risk-calculator-eight.vercel.app/api/ai/scenario-draft');
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.equal(fetchCalls[0].options.headers['x-session-token'], 'session-token');
  assert.equal(result.mode, 'live');
  assert.equal(result.scenarioLens?.key, 'identity');
  assert.equal(service.getLatestTrace('Step 1 guided draft')?.response, 'Server returned guided draft');
});

test('buildGuidedScenarioDraft still uses the server scenario-draft endpoint even when local-dev direct Compass config is enabled', async () => {
  const fetchCalls = [];
  const service = loadService({
    origin: 'http://127.0.0.1:8080',
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({
          mode: 'deterministic_fallback',
          draftNarrative: 'Server-owned guided draft',
          usedFallback: true
        })
      };
    }
  });

  service.setCompassConfig({
    apiUrl: 'https://api.core42.ai/v1/chat/completions',
    model: 'gpt-local-test',
    apiKey: 'browser-secret'
  });

  await service.buildGuidedScenarioDraft({
    riskStatement: 'A key supplier misses a delivery date.'
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://risk-calculator-eight.vercel.app/api/ai/scenario-draft');
});
