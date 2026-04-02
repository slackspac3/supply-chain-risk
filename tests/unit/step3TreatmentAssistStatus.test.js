'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStep3Helper() {
  const filePath = path.resolve(__dirname, '../../assets/wizard/step3.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    AppState: { draft: {} }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'step3.js' });
  return context.getStep3TreatmentAssistStatusCopy;
}

test('treatment assist status copy distinguishes live, deterministic fallback, manual, and default states', () => {
  const getStatusCopy = loadStep3Helper();

  assert.match(
    getStatusCopy({ treatmentSuggestionMode: 'live' }),
    /live ai adjusted/i
  );
  assert.match(
    getStatusCopy({ treatmentSuggestionMode: 'deterministic_fallback' }),
    /deterministic fallback adjusted/i
  );
  assert.match(
    getStatusCopy({ treatmentSuggestionMode: 'manual' }),
    /stayed manual/i
  );
  assert.match(
    getStatusCopy({ treatmentSuggestionMode: '' }),
    /quick starting points/i
  );
});
