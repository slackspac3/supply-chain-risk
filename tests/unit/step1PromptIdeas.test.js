'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStep1Internals() {
  const filePath = path.resolve(__dirname, '../../assets/wizard/step1.js');
  const source = fs.readFileSync(filePath, 'utf8');

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
    Set,
    Map,
    localStorage: noopStorage,
    sessionStorage: noopStorage,
    window: { Step1Assist: {} },
    document: {},
    AppState: { draft: {} },
    AuthService: {
      getCurrentUser: () => ({})
    },
    getEffectiveSettings: () => ({}),
    normaliseUserProfile: () => ({
      jobTitle: '',
      department: '',
      businessUnit: '',
      workingContext: '',
      focusAreas: []
    }),
    getSelectedRisks: () => [],
    getRiskCandidates: () => [],
    getScenarioGeographies: () => [],
    getBUList: () => [],
    escapeHtml: (value) => String(value || ''),
    getDisclosureStateKey: () => '',
    getDisclosureOpenState: () => false,
    UI: {},
    saveDraft: () => {},
    markDraftDirty: () => {},
    persistAndRenderStep1: () => {},
    normaliseAssessmentTokens: (text = '') => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'step1.js' });
  return {
    inferStep1FunctionKeyFromText: context.inferStep1FunctionKeyFromText,
    buildStep1GuidedPromptSuggestions: context.buildStep1GuidedPromptSuggestions
  };
}

test('CEO mailbox hijack stays in the identity/cyber prompt lane', () => {
  const internals = loadStep1Internals();
  const functionKey = internals.inferStep1FunctionKeyFromText('CEO email account hijacked');
  assert.equal(functionKey, 'technology');

  const suggestions = internals.buildStep1GuidedPromptSuggestions({
    guidedInput: {
      event: 'CEO email account hijacked',
      asset: '',
      cause: '',
      impact: ''
    }
  }, {
    recommendedExamples: [
      { promptLabel: 'Contract cover gap', event: 'A contract gap emerges.', functionKey: 'procurement' },
      { promptLabel: 'Single-source shortfall', event: 'A single source fails.', functionKey: 'procurement' },
      { promptLabel: 'Responsible AI drift', event: 'An AI assistant drifts.', functionKey: 'technology' }
    ]
  });

  const labels = suggestions.map(item => item.label);
  assert.ok(labels.includes('Identity takeover'));
  assert.ok(labels.includes('Executive mailbox compromise'));
  assert.equal(labels.includes('Contract cover gap'), false);
  assert.equal(labels.includes('Single-source shortfall'), false);
  assert.equal(labels.includes('Responsible AI drift'), false);
});

test('dark-web Azure admin credential discovery does not leak AI-model prompt ideas', () => {
  const internals = loadStep1Internals();
  const suggestions = internals.buildStep1GuidedPromptSuggestions({
    guidedInput: {
      event: 'An Azure admin account credential were found on the darkweb',
      asset: '',
      cause: '',
      impact: ''
    }
  }, {
    recommendedExamples: [
      { promptLabel: 'Responsible AI drift', event: 'An AI assistant drifts.', functionKey: 'technology' }
    ]
  });

  const labels = suggestions.map(item => item.label);
  assert.ok(labels.includes('Privileged credential exposure'));
  assert.ok(labels.includes('Admin account takeover'));
  assert.equal(labels.includes('Responsible AI drift'), false);
});
