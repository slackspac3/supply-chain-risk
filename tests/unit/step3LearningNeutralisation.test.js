'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadStep3Context() {
  const filePath = path.resolve(__dirname, '../../assets/wizard/step3.js');
  const source = fs.readFileSync(filePath, 'utf8');
  let smartPrefillCalls = 0;
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    AppState: { draft: {} },
    renderWizard3() {},
    LLMService: {
      async suggestSmartParamPrefill() {
        smartPrefillCalls += 1;
        return null;
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'step3.js' });
  return {
    context,
    getSmartPrefillCalls: () => smartPrefillCalls
  };
}

test('step3 smart prefill band is disabled for browser-local learning suggestions', () => {
  const { context } = loadStep3Context();
  assert.equal(context.renderSmartPrefillBand({ fairParams: {} }, false), '');
});

test('step3 smart prefill request no longer calls browser-side AI suggestion flow', async () => {
  const { context, getSmartPrefillCalls } = loadStep3Context();
  const draft = { fairParams: {} };

  const result = await context.requestStep3SmartPrefillIfNeeded(draft, false);

  assert.equal(result, null);
  assert.equal(getSmartPrefillCalls(), 0);
  assert.equal(draft.smartPrefillState.status, 'empty');
});
