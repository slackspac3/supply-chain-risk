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

test('suggestTreatmentImprovement uses the server treatment-suggestion endpoint and stores returned trace in runtime memory', async () => {
  const fetchCalls = [];
  const service = loadService({
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({
          summary: 'Server-owned treatment suggestion',
          suggestedInputs: {
            TEF: { min: 1, likely: 2, max: 3 },
            controlStrength: { min: 0.5, likely: 0.7, max: 0.9 },
            threatCapability: { min: 0.2, likely: 0.4, max: 0.7 },
            lossComponents: {
              incidentResponse: { min: 1, likely: 2, max: 3 },
              businessInterruption: { min: 4, likely: 5, max: 6 },
              dataBreachRemediation: { min: 7, likely: 8, max: 9 },
              regulatoryLegal: { min: 10, likely: 11, max: 12 },
              thirdPartyLiability: { min: 13, likely: 14, max: 15 },
              reputationContract: { min: 16, likely: 17, max: 18 }
            }
          },
          trace: {
            label: 'Step 3 treatment suggestion',
            promptSummary: 'Server prompt summary',
            response: 'Server returned treatment suggestion'
          }
        })
      };
    }
  });

  const result = await service.suggestTreatmentImprovement({
    baselineAssessment: {
      scenarioTitle: 'Identity compromise'
    },
    improvementRequest: 'Stronger MFA'
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://risk-calculator-eight.vercel.app/api/ai/treatment-suggestion');
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.equal(fetchCalls[0].options.headers['x-session-token'], 'session-token');
  assert.equal(typeof result.suggestedInputs?.TEF?.likely, 'number');
  assert.equal(service.getLatestTrace('Step 3 treatment suggestion')?.response, 'Server returned treatment suggestion');
});

test('suggestTreatmentImprovement still uses the server treatment-suggestion endpoint even when local-dev direct Compass config is enabled', async () => {
  const fetchCalls = [];
  const service = loadService({
    origin: 'http://127.0.0.1:8080',
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({
          summary: 'Fallback treatment suggestion',
          usedFallback: true,
          suggestedInputs: {
            TEF: { min: 1, likely: 2, max: 3 },
            controlStrength: { min: 0.5, likely: 0.7, max: 0.9 },
            threatCapability: { min: 0.2, likely: 0.4, max: 0.7 },
            lossComponents: {
              incidentResponse: { min: 1, likely: 2, max: 3 },
              businessInterruption: { min: 4, likely: 5, max: 6 },
              dataBreachRemediation: { min: 7, likely: 8, max: 9 },
              regulatoryLegal: { min: 10, likely: 11, max: 12 },
              thirdPartyLiability: { min: 13, likely: 14, max: 15 },
              reputationContract: { min: 16, likely: 17, max: 18 }
            }
          }
        })
      };
    }
  });

  service.setCompassConfig({
    apiUrl: 'https://api.core42.ai/v1/chat/completions',
    model: 'gpt-local-test',
    apiKey: 'browser-secret'
  });

  await service.suggestTreatmentImprovement({
    baselineAssessment: {
      scenarioTitle: 'Identity compromise'
    },
    improvementRequest: 'Stronger MFA'
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://risk-calculator-eight.vercel.app/api/ai/treatment-suggestion');
});
