'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStep1AssistNarrativeHarness() {
  const filePath = path.resolve(__dirname, '../../assets/wizard/step1Assist.js');
  const source = fs.readFileSync(filePath, 'utf8');

  const capturedRequests = [];
  const output = { innerHTML: '' };
  const enhanceButton = {
    dataset: {},
    textContent: 'Use AI to refine this draft',
    disabled: false,
    isConnected: true,
    setAttribute() {},
    removeAttribute() {}
  };
  const narrativeInput = {
    value: 'Azure global admin credentials discovered on the dark web are used to access the tenant and modify critical configurations.'
  };

  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    setTimeout,
    clearTimeout,
    AppState: {
      draft: {
        narrative: '',
        sourceNarrative: '',
        enhancedNarrative: '',
        scenarioLens: { key: 'financial', label: 'Financial', functionKey: 'finance' },
        guidedInput: {},
        llmContext: [],
        step1ConversationFingerprint: ''
      }
    },
    document: {
      querySelectorAll() {
        return [];
      },
      getElementById(id) {
        if (id === 'intake-risk-statement') return narrativeInput;
        if (id === 'btn-enhance-risk-statement') return enhanceButton;
        if (id === 'intake-output') return output;
        return null;
      }
    },
    window: {
      DraftScenarioState: {
        getIntakeAssistSeedNarrative(value) {
          return value;
        },
        applyScenarioAssistResultToDraft() {}
      },
      scheduleStep1ScenarioCrossReferenceRefresh() {},
      setTimeout,
      clearTimeout
    },
    UI: {
      toast() {},
      wizardAssistSkeleton() {
        return '<div>loading</div>';
      }
    },
    AuthService: {
      getCurrentUser() {
        return { role: 'user' };
      }
    },
    AiWorkflowClient: null,
    LLMService: {
      async buildManualDraftRefinement(payload) {
        capturedRequests.push(payload);
        return {
          enhancedStatement: payload.riskStatement,
          draftNarrative: payload.riskStatement,
          risks: []
        };
      }
    },
    RAGService: {
      isReady: () => true,
      retrieveRelevantDocs: async () => []
    },
    escapeHtml: (value) => String(value || ''),
    getAiUnavailableMessage: () => 'AI assistance is temporarily unavailable.',
    _setStep1ButtonBusy: () => () => {},
    getEffectiveSettings: () => ({}),
    getBUList: () => [],
    getStep1PreferredScenarioLens: () => ({ key: 'financial', label: 'Financial', functionKey: 'finance' }),
    getStep1ManualPreferredScenarioLens: () => ({ key: 'cyber', label: 'Cyber', functionKey: 'technology' }),
    buildCurrentAIAssistContext: () => ({ businessUnit: null, adminSettings: {} }),
    buildAssessmentRetrievalQuery: () => 'query',
    deriveApplicableRegulations: () => [],
    getSelectedRisks: () => [],
    getScenarioGeographies: () => [],
    formatScenarioGeographies: () => '',
    dispatchDraftAction() {},
    saveDraft() {},
    renderWizard1() {},
    buildEvidenceTrustSummary: null
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'step1Assist.js' });

  return {
    enhanceNarrativeWithAI: context.window.Step1Assist.enhanceNarrativeWithAI,
    capturedRequests
  };
}

test('narrative refinement sends the fresh manual lens hint instead of stale stored lens state', async () => {
  const harness = loadStep1AssistNarrativeHarness();

  await harness.enhanceNarrativeWithAI();

  assert.equal(harness.capturedRequests.length, 1);
  assert.equal(harness.capturedRequests[0].scenarioLensHint?.key, 'cyber');
  assert.equal(harness.capturedRequests[0].scenarioLensHint?.functionKey, 'technology');
});

test('narrative refinement drops stale prior messages when the scenario fingerprint changes', async () => {
  const harness = loadStep1AssistNarrativeHarness();
  harness.capturedRequests.length = 0;

  const staleFingerprint = 'legacy scenario | financial';
  const staleMessages = [{ role: 'user', content: 'Refine the payment-control draft.' }];
  const filePath = path.resolve(__dirname, '../../assets/wizard/step1Assist.js');
  void filePath;

  const source = fs.readFileSync(path.resolve(__dirname, '../../assets/wizard/step1Assist.js'), 'utf8');
  const capturedRequests = [];
  const output = { innerHTML: '' };
  const enhanceButton = {
    dataset: {},
    textContent: 'Use AI to refine this draft',
    disabled: false,
    isConnected: true,
    setAttribute() {},
    removeAttribute() {}
  };
  const narrativeInput = {
    value: 'Azure global admin credentials discovered on the dark web are used to access the tenant and modify critical configurations.'
  };
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    setTimeout,
    clearTimeout,
    AppState: {
      draft: {
        narrative: '',
        sourceNarrative: '',
        enhancedNarrative: '',
        scenarioLens: { key: 'financial', label: 'Financial', functionKey: 'finance' },
        guidedInput: {},
        llmContext: staleMessages,
        step1ConversationFingerprint: staleFingerprint
      }
    },
    document: {
      querySelectorAll() {
        return [];
      },
      getElementById(id) {
        if (id === 'intake-risk-statement') return narrativeInput;
        if (id === 'btn-enhance-risk-statement') return enhanceButton;
        if (id === 'intake-output') return output;
        return null;
      }
    },
    window: {
      DraftScenarioState: {
        getIntakeAssistSeedNarrative(value) {
          return value;
        },
        applyScenarioAssistResultToDraft() {}
      },
      scheduleStep1ScenarioCrossReferenceRefresh() {},
      setTimeout,
      clearTimeout
    },
    UI: {
      toast() {},
      wizardAssistSkeleton() {
        return '<div>loading</div>';
      }
    },
    AuthService: {
      getCurrentUser() {
        return { role: 'user' };
      }
    },
    AiWorkflowClient: null,
    LLMService: {
      async buildManualDraftRefinement(payload) {
        capturedRequests.push(payload);
        return {
          enhancedStatement: payload.riskStatement,
          draftNarrative: payload.riskStatement,
          risks: []
        };
      }
    },
    RAGService: {
      isReady: () => true,
      retrieveRelevantDocs: async () => []
    },
    escapeHtml: (value) => String(value || ''),
    getAiUnavailableMessage: () => 'AI assistance is temporarily unavailable.',
    _setStep1ButtonBusy: () => () => {},
    getEffectiveSettings: () => ({}),
    getBUList: () => [],
    getStep1PreferredScenarioLens: () => ({ key: 'financial', label: 'Financial', functionKey: 'finance' }),
    getStep1ManualPreferredScenarioLens: () => ({ key: 'cyber', label: 'Cyber', functionKey: 'technology' }),
    buildCurrentAIAssistContext: () => ({ businessUnit: null, adminSettings: {} }),
    buildAssessmentRetrievalQuery: () => 'query',
    deriveApplicableRegulations: () => [],
    getSelectedRisks: () => [],
    getScenarioGeographies: () => [],
    formatScenarioGeographies: () => '',
    dispatchDraftAction() {},
    saveDraft() {},
    renderWizard1() {},
    buildEvidenceTrustSummary: null
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'step1Assist.js' });

  await context.window.Step1Assist.enhanceNarrativeWithAI();

  assert.equal(capturedRequests.length, 1);
  assert.deepEqual(Array.from(capturedRequests[0].priorMessages || []), []);
  assert.notEqual(capturedRequests[0].scenarioFingerprint, staleFingerprint);
});
