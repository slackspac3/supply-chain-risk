'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadTraceRuntime() {
  const filePath = path.resolve(__dirname, '../../assets/services/llmService.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const instrumented = `${source.replace(
    '  return {\n    buildGuidedScenarioDraft,',
    '  globalThis.__llmTraceInternals = { _storeAiTraceEntry, _readAiTrace };\n\n  return {\n    buildGuidedScenarioDraft,'
  )}\n;globalThis.__llmService = LLMService;`;

  const forbiddenStorage = {
    getItem() {
      throw new Error('trace runtime test should not read browser storage');
    },
    setItem() {
      throw new Error('trace runtime test should not write browser storage');
    },
    removeItem() {
      throw new Error('trace runtime test should not remove browser storage');
    }
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
    sessionStorage: forbiddenStorage,
    localStorage: forbiddenStorage,
    window: {
      location: { origin: 'https://slackspac3.github.io', hostname: 'slackspac3.github.io' },
      _lastRagSources: []
    },
    fetch: async () => {
      throw new Error('fetch should not be called in llmTraceRuntime.test.js');
    },
    AIGuardrails: null,
    BenchmarkService: {},
    logAuditEvent: async () => {}
  };

  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename: 'llmService.js' });
  return {
    service: context.__llmService,
    internals: context.__llmTraceInternals
  };
}

test('AI traces stay in runtime memory and do not require browser storage', () => {
  const { service, internals } = loadTraceRuntime();
  const traceEntry = internals._storeAiTraceEntry({
    label: 'Step 1 guided draft',
    promptSummary: 'System: classify the scenario.\n\nUser: Azure admin credentials found on the dark web.',
    response: 'High-urgency Cyber scenario: Privileged credentials are actively exposed.',
    sources: [
      {
        title: 'Identity source',
        url: 'https://example.com/source',
        sourceType: 'rag',
        relevanceReason: 'Recent identity exposure reference'
      }
    ]
  });

  assert.equal(typeof traceEntry?.id, 'string');
  assert.equal(internals._readAiTrace().length, 1);
  assert.deepEqual(service.getLatestTrace('Step 1 guided draft'), traceEntry);
  assert.equal(service.getLatestTrace('Missing trace'), null);
});
