'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadService(origin = 'https://slackspac3.github.io') {
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
    fetch: async () => {
      throw new Error('fetch should not be called in llmRuntimeConfig.test.js');
    },
    AIGuardrails: null,
    BenchmarkService: {},
    logAuditEvent: async () => {}
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'llmService.js' });
  return context.__llmService;
}

test('pilot and production origins ignore browser-direct Compass configuration', () => {
  const service = loadService('https://slackspac3.github.io');
  service.setCompassConfig({
    apiUrl: 'https://api.core42.ai/v1/chat/completions',
    model: 'gpt-local-test',
    apiKey: 'browser-secret'
  });

  const runtimeStatus = service.getRuntimeStatus();
  assert.equal(service.isLocalDevRuntimeConfigAllowed(), false);
  assert.equal(runtimeStatus.usingDirectCompass, false);
  assert.equal(runtimeStatus.hasApiKey, false);
  assert.equal(runtimeStatus.apiUrl.includes('/api/compass'), true);
  assert.equal(runtimeStatus.model, 'gpt-5.1');
});

test('localhost can still opt into direct Compass configuration for explicit local development', () => {
  const service = loadService('http://127.0.0.1:8080');
  service.setCompassConfig({
    apiUrl: 'https://api.core42.ai/v1/chat/completions',
    model: 'gpt-local-test',
    apiKey: 'browser-secret'
  });

  const runtimeStatus = service.getRuntimeStatus();
  assert.equal(service.isLocalDevRuntimeConfigAllowed(), true);
  assert.equal(runtimeStatus.usingDirectCompass, true);
  assert.equal(runtimeStatus.hasApiKey, true);
  assert.equal(runtimeStatus.model, 'gpt-local-test');
});
