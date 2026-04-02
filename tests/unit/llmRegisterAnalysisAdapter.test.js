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

test('analyseRiskRegister uses the server register-analysis endpoint and stores returned trace in runtime memory', async () => {
  const fetchCalls = [];
  const service = loadService({
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({
          mode: 'live',
          summary: 'Server-owned register analysis summary',
          risks: [
            {
              title: 'Privileged access review weakness',
              category: 'Identity & Access',
              description: 'Stale access review activity is visible in the register.',
              confidence: 'high',
              source: 'ai+register'
            }
          ],
          trace: {
            label: 'Step 1 register analysis',
            promptSummary: 'Server prompt summary',
            response: 'Server returned register shortlist'
          }
        })
      };
    }
  });

  const result = await service.analyseRiskRegister({
    registerText: 'Privileged access review is incomplete and stale.',
    traceLabel: 'Step 1 register analysis'
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://risk-calculator-eight.vercel.app/api/ai/register-analysis');
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.equal(fetchCalls[0].options.headers['x-session-token'], 'session-token');
  assert.equal(result.mode, 'live');
  assert.equal(Array.isArray(result.risks), true);
  assert.equal(service.getLatestTrace('Step 1 register analysis')?.response, 'Server returned register shortlist');
});

test('analyseRiskRegister still uses the server register-analysis endpoint even when local-dev direct Compass config is enabled', async () => {
  const fetchCalls = [];
  const service = loadService({
    origin: 'http://127.0.0.1:8080',
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({
          mode: 'deterministic_fallback',
          summary: 'Fallback register analysis',
          usedFallback: true,
          risks: []
        })
      };
    }
  });

  service.setCompassConfig({
    apiUrl: 'https://api.core42.ai/v1/chat/completions',
    model: 'gpt-local-test',
    apiKey: 'browser-secret'
  });

  await service.analyseRiskRegister({
    registerText: 'Third-party dependency control is weak.'
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://risk-calculator-eight.vercel.app/api/ai/register-analysis');
});
