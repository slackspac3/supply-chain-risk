'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadAiWorkflowClient() {
  const filePath = path.resolve(__dirname, '../../assets/services/aiWorkflowClient.js');
  const source = `${fs.readFileSync(filePath, 'utf8')}
;globalThis.__aiWorkflowClientTest = AiWorkflowClient;`;
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    setTimeout,
    clearTimeout
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'aiWorkflowClient.js' });
  return context.__aiWorkflowClientTest;
}

test('workflow fingerprints normalise semantically identical scenario-draft payloads', () => {
  const client = loadAiWorkflowClient();

  const first = client.buildWorkflowFingerprint('/api/ai/scenario-draft', {
    riskStatement: ' Azure   global admin credentials found on the dark web. ',
    guidedInput: {
      event: 'Azure global admin credentials found on the dark web.',
      impact: ' Control disruption and fraud exposure '
    },
    applicableRegulations: ['UAE PDPL', 'UAE PDPL', ' ISO 27001 ']
  });
  const second = client.buildWorkflowFingerprint('/api/ai/scenario-draft', {
    riskStatement: 'Azure global admin credentials found on the dark web.',
    guidedInput: {
      event: '  Azure global admin credentials found on the dark web. ',
      impact: 'Control disruption and fraud exposure'
    },
    applicableRegulations: ['UAE PDPL', 'ISO 27001']
  });

  assert.equal(first, second);
});

test('workflow fingerprints include a normalised step 1 scenario fingerprint for manual routes', () => {
  const client = loadAiWorkflowClient();

  const first = client.buildWorkflowFingerprint('/api/ai/manual-draft-refinement', {
    riskStatement: 'Azure global admin credentials found on the dark web.',
    scenarioFingerprint: ' corp-tech | technology | Azure global admin credentials found on the dark web. ',
    geography: 'United Arab Emirates'
  });
  const second = client.buildWorkflowFingerprint('/api/ai/manual-draft-refinement', {
    riskStatement: 'Azure global admin credentials found on the dark web.',
    scenarioFingerprint: 'corp-tech | technology | Azure global admin credentials found on the dark web.',
    geography: 'United Arab Emirates'
  });

  assert.equal(first, second);
});

test('action cooldown store blocks only the same normalised payload within the cooldown window', async () => {
  const client = loadAiWorkflowClient();
  const store = client.createActionCooldownStore({ cooldownMs: 25, maxEntries: 8 });
  const basePayload = {
    baselineAssessment: {
      scenarioTitle: 'Identity compromise',
      enhancedNarrative: 'Compromised credentials are used to access privileged systems.'
    },
    improvementRequest: 'Improve containment and reduce disruption.'
  };

  assert.equal(
    store.getRemainingMs('/api/ai/treatment-suggestion', basePayload, { scope: 'step3' }) > 0,
    false
  );

  store.markCompleted('/api/ai/treatment-suggestion', {
    baselineAssessment: {
      scenarioTitle: ' Identity compromise ',
      enhancedNarrative: 'Compromised credentials are used to access privileged systems.'
    },
    improvementRequest: ' Improve containment   and reduce disruption. '
  }, { scope: 'step3' });

  assert.equal(
    store.getRemainingMs('/api/ai/treatment-suggestion', basePayload, { scope: 'step3' }) > 0,
    true
  );
  assert.equal(
    store.getRemainingMs('/api/ai/treatment-suggestion', {
      ...basePayload,
      improvementRequest: 'Improve containment, reduce disruption, and strengthen controls.'
    }, { scope: 'step3' }) > 0,
    false
  );

  await new Promise((resolve) => setTimeout(resolve, 35));

  assert.equal(
    store.getRemainingMs('/api/ai/treatment-suggestion', basePayload, { scope: 'step3' }) > 0,
    false
  );
});
