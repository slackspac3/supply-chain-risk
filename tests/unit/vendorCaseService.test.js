'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const VendorCaseService = require('../../assets/services/vendorCaseService.js');

test.beforeEach(() => {
  VendorCaseService.resetSeedData();
});

test('vendor case service seeds internal and vendor-visible PoC cases', () => {
  const allCases = VendorCaseService.getAllCases();
  const vendorCases = VendorCaseService.getCasesForUser({ username: 'vendor.demo', role: 'vendor_contact' });
  const internalCases = VendorCaseService.getCasesForUser({ username: 'analyst', role: 'gtr_analyst' });

  assert.equal(allCases.length, 3);
  assert.equal(vendorCases.length, 1);
  assert.equal(vendorCases[0].id, 'VRM-2026-001');
  assert.equal(internalCases.length, 3);
});

test('saving a vendor questionnaire draft updates shared case state', () => {
  const updatedCase = VendorCaseService.saveVendorQuestionnaire('VRM-2026-002', {
    incident_notification: 'Critical incidents are escalated within 24 hours.'
  }, {
    submitted: false,
    actorUsername: 'vendor.ai'
  });

  assert.equal(updatedCase.status, 'vendor_in_progress');
  assert.equal(updatedCase.questionnaire.status, 'draft');
  assert.equal(updatedCase.questionnaire.responses.incident_notification, 'Critical incidents are escalated within 24 hours.');
});

test('submitting a vendor questionnaire moves the case to internal review', () => {
  const updatedCase = VendorCaseService.saveVendorQuestionnaire('VRM-2026-002', {
    ai_governance: 'Model governance review completed.'
  }, {
    submitted: true,
    actorUsername: 'vendor.ai'
  });

  assert.equal(updatedCase.status, 'internal_review');
  assert.equal(updatedCase.questionnaire.status, 'submitted');
  assert.match(updatedCase.vendor.latestMessage, /submitted/i);
});

test('clarification loop transitions between internal and vendor states', () => {
  const clarificationRequested = VendorCaseService.requestClarification('VRM-2026-002', 'Please confirm model retention controls.', {
    actorUsername: 'Lina GTR',
    actorRole: 'gtr_analyst'
  });
  const clarificationResponded = VendorCaseService.addVendorClarificationResponse('VRM-2026-002', 'Model prompts are retained for 30 days only.', {
    actorUsername: 'vendor.ai'
  });

  assert.equal(clarificationRequested.status, 'awaiting_vendor_clarification');
  assert.equal(clarificationResponded.status, 'internal_review');
  assert.equal(clarificationResponded.vendor.clarificationHistory.at(-1).direction, 'vendor_response');
});

test('saving an internal decision updates outcome and risk bands', () => {
  const decidedCase = VendorCaseService.saveInternalDecision('VRM-2026-001', {
    outcome: 'conditional_pass',
    likelihood: 'High',
    impact: 'High',
    riskStatement: 'Residual supplier workflow risk remains open pending clause hardening.',
    mitigation: 'Finalize hosting and notification clauses before contract sign-off.'
  }, {
    actorUsername: 'Maya Approver',
    actorRole: 'approver'
  });

  assert.equal(decidedCase.status, 'conditional_pass');
  assert.equal(decidedCase.rating.decisionOutcome, 'conditional_pass');
  assert.equal(decidedCase.rating.likelihood, 'High');
  assert.equal(decidedCase.rating.impact, 'High');
  assert.match(decidedCase.decision.riskStatement, /residual supplier workflow risk/i);
});
