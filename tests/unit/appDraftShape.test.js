'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadEnsureDraftShape() {
  const filePath = path.resolve(__dirname, '../../assets/app.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const start = source.indexOf('function ensureDraftShape() {');
  const end = source.indexOf('\nfunction getBUList()', start);
  if (start < 0 || end < 0) {
    throw new Error('Could not locate ensureDraftShape in app.js');
  }
  const snippet = source.slice(start, end);
  const context = {
    AppState: {
      draft: {
        id: 'a_1',
        createdAt: 123,
        startedAt: 123,
        narrative: 'Draft text',
        aiFeedback: {
          draft: {
            score: 4,
            reasons: ['useful-with-edits'],
            runtimeMode: 'live_ai',
            savedAt: 1710000000000
          }
        },
        guidedInput: {},
        geographies: [],
        applicableRegulations: [],
        citations: [],
        recommendations: [],
        riskCandidates: [],
        selectedRiskIds: [],
        selectedRisks: []
      }
    },
    DEFAULT_ADMIN_SETTINGS: {
      geography: 'United Arab Emirates',
      defaultLinkMode: true,
      applicableRegulations: []
    },
    normaliseStructuredScenario: (value) => value || {},
    buildResolvedObligationSnapshot: (value) => value,
    formatScenarioGeographies: () => '',
    normaliseScenarioGeographies: () => [],
    console
  };
  vm.createContext(context);
  vm.runInContext(snippet, context, { filename: 'app.js' });
  return context;
}

test('ensureDraftShape preserves draft aiFeedback state across rerender normalisation', () => {
  const context = loadEnsureDraftShape();
  context.ensureDraftShape();
  assert.deepEqual(context.AppState.draft.aiFeedback, {
    draft: {
      score: 4,
      reasons: ['useful-with-edits'],
      runtimeMode: 'live_ai',
      savedAt: 1710000000000
    }
  });
});
