'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadLlmInternals() {
  const filePath = path.resolve(__dirname, '../../assets/services/llmService.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const instrumented = source.replace(
    '  return {\n    buildGuidedScenarioDraft,',
    '  globalThis.__llmInternals = { _classifyScenario, _extractRiskCandidates, _evaluateGuidedDraftCandidate, _filterPromptIdeaCandidates };\n\n  return {\n    buildGuidedScenarioDraft,'
  );
  assert.notEqual(instrumented, source, 'Failed to instrument llmService internals for test access');

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
      location: { origin: 'http://127.0.0.1:8080' },
      _lastRagSources: []
    },
    fetch: async () => {
      throw new Error('fetch should not be called in llmServiceClassification.test.js');
    },
    AIGuardrails: null,
    BenchmarkService: {},
    logAuditEvent: async () => {}
  };

  vm.createContext(context);
  vm.runInContext(instrumented, context, { filename: 'llmService.js' });
  return context.__llmInternals;
}

test('classifies technology downtime with human error as operational rather than cyber', () => {
  const internals = loadLlmInternals();
  const classification = internals._classifyScenario(
    'Unscheduled IT system downtime due to aging infrastructure may cause critical operational disruption.',
    {
      guidedInput: {
        event: 'Unscheduled IT system downtime due to aging infrastructure may cause critical operational disruption',
        asset: 'Cloud system',
        cause: 'Human error',
        impact: 'Customer impact, reputational loss'
      }
    }
  );

  assert.equal(classification.key, 'operational');
});

test('extractRiskCandidates prefers operational outage risks over cyber for non-compromise cloud downtime', () => {
  const internals = loadLlmInternals();
  const risks = internals._extractRiskCandidates(
    'Unscheduled IT system downtime due to aging infrastructure. Cloud system affected. Human error triggered critical operational disruption and customer impact.',
    {
      lensHint: { key: 'operational', label: 'Operational' }
    }
  );

  assert.equal(risks[0]?.key, 'operational');
  assert.equal(risks.some((risk) => risk.key === 'cyber'), false);
});

test('evaluateGuidedDraftCandidate rejects a draft that explicitly labels the wrong lens', () => {
  const internals = loadLlmInternals();
  const candidate = internals._evaluateGuidedDraftCandidate(
    'Critical-urgency Compliance scenario: Unscheduled IT system downtime due to aging infrastructure may cause critical operational disruption. The area most exposed is the cloud system. The most likely driver is human error. If this develops, it could create customer impact and reputational loss.',
    {
      seedNarrative: 'Critical-urgency Operational scenario: Unscheduled IT system downtime due to aging infrastructure may cause critical operational disruption. The area most exposed is the cloud system. The most likely driver is human error. If this develops, it could create customer impact and reputational loss.',
      guidedInput: {
        event: 'Unscheduled IT system downtime due to aging infrastructure may cause critical operational disruption',
        asset: 'Cloud system',
        cause: 'Human error',
        impact: 'Customer impact, reputational loss'
      },
      scenarioLensHint: { key: 'operational', label: 'Operational' }
    }
  );

  assert.equal(candidate.accepted, false);
  assert.equal(candidate.reason, 'explicit-lens-drift');
});

test('filterPromptIdeaCandidates rejects AI-model drift for dark-web credential exposure', () => {
  const internals = loadLlmInternals();
  const ideas = internals._filterPromptIdeaCandidates([
    {
      label: 'Privileged credential exposure',
      prompt: 'Privileged or administrator credentials are exposed and create a high-risk access path.'
    },
    {
      label: 'Responsible AI drift',
      prompt: 'A model governance issue creates unsafe output and conduct risk.'
    }
  ], {
    sourceText: 'An Azure admin account credential were found on the darkweb',
    classification: { key: 'identity', secondaryKeys: [] },
    scenarioLensHint: 'identity'
  });

  const labels = ideas.map((idea) => idea.label);
  assert.ok(labels.includes('Privileged credential exposure'));
  assert.equal(labels.includes('Responsible AI drift'), false);
});
