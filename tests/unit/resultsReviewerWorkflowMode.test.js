'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadResultsHelpers() {
  const filePath = path.resolve(__dirname, '../../assets/results/resultsRoute.js');
  const source = `${fs.readFileSync(filePath, 'utf8')}
;globalThis.__resultsRouteTest = {
  normaliseReviewerWorkflowMode,
  getReviewerWorkflowModePresentation,
  renderAssessmentChallengeResult,
  renderReviewMediationResult
};`;

  const context = {
    console,
    Math,
    JSON,
    Date,
    escapeHtml(value) {
      return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    },
    UI: {},
    AuthService: { getCurrentUser: () => null }
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'resultsRoute.js' });
  return context.__resultsRouteTest;
}

test('reviewer workflow helpers distinguish live, deterministic fallback, and manual states', () => {
  const {
    normaliseReviewerWorkflowMode,
    getReviewerWorkflowModePresentation
  } = loadResultsHelpers();

  assert.equal(normaliseReviewerWorkflowMode({ mode: 'live' }), 'live');
  assert.equal(normaliseReviewerWorkflowMode({ usedFallback: true }), 'deterministic_fallback');
  assert.equal(normaliseReviewerWorkflowMode({ aiUnavailable: true }), 'manual');

  const fallbackMeta = getReviewerWorkflowModePresentation({
    mode: 'deterministic_fallback',
    fallbackReasonMessage: 'Server fallback in use.'
  }, {
    fallbackLabel: 'Deterministic fallback challenge'
  });
  assert.equal(fallbackMeta.label, 'Deterministic fallback challenge');
  assert.equal(fallbackMeta.message, 'Server fallback in use.');

  const manualMeta = getReviewerWorkflowModePresentation({
    mode: 'manual',
    manualReasonMessage: 'Keep the review manual.'
  }, {
    manualLabel: 'Manual mediation guidance'
  });
  assert.equal(manualMeta.label, 'Manual mediation guidance');
  assert.equal(manualMeta.message, 'Keep the review manual.');
});

test('reviewer/challenge renderers show honest mode labels and hide manual-only actions', () => {
  const {
    renderAssessmentChallengeResult,
    renderReviewMediationResult
  } = loadResultsHelpers();

  const fallbackChallenge = renderAssessmentChallengeResult({
    mode: 'deterministic_fallback',
    confidenceVerdict: 'Likely understated',
    challengeSummary: 'Fallback challenge summary.',
    weakestAssumption: 'Recovery timing remains weak.',
    alternativeView: 'Assume slower recovery.',
    oneQuestion: 'What evidence proves the current recovery window?',
    fallbackReasonMessage: 'The server used a deterministic challenge.'
  });
  assert.match(fallbackChallenge, /Deterministic fallback challenge/);
  assert.match(fallbackChallenge, /The server used a deterministic challenge\./);

  const manualMediation = renderReviewMediationResult({
    mode: 'manual',
    proposedMiddleGround: 'Keep the discussion manual.',
    reconciliationSummary: 'No server proposal was produced.',
    whyReasonable: 'The evidence pack needs human review.',
    evidenceToVerify: 'Latest control test.',
    manualReasonMessage: 'Continue without treating this as live AI output.'
  });
  assert.match(manualMediation, /Manual mediation guidance/);
  assert.match(manualMediation, /Continue without treating this as live AI output\./);
  assert.doesNotMatch(manualMediation, /btn-accept-mediation/);
});
