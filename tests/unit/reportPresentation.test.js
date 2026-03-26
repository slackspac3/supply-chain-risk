'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ReportPresentation = require('../../assets/services/reportPresentation.js');

test('buildExecutiveScenarioSummary produces business-friendly wording', () => {
  const summary = ReportPresentation.buildExecutiveScenarioSummary({
    buName: 'Digital Platforms',
    geography: 'United Arab Emirates',
    structuredScenario: {
      assetService: 'customer-facing payments platform',
      attackType: 'supplier compromise causing service outage',
      effect: 'service disruption and regulatory scrutiny'
    },
    narrative: 'The main asset, service, or team affected is the customer-facing payments platform. The likely trigger or threat driver is supplier compromise causing service outage.'
  });

  assert.match(summary, /Digital Platforms is assessing a material risk scenario/i);
  assert.doesNotMatch(summary, /identity and access scenario/i);
  assert.match(summary, /This view should be read in the context of United Arab Emirates/i);
});

test('buildExecutiveDecisionSupport uses uncertainty-aware business wording', () => {
  const decision = ReportPresentation.buildExecutiveDecisionSupport(
    {},
    { nearTolerance: true, annualReviewTriggered: false, toleranceBreached: false },
    {
      confidence: { label: 'Low confidence' },
      drivers: {
        upward: ['Business interruption is pushing the result upward.'],
        stabilisers: [],
        uncertainty: [{ label: 'Business interruption range' }]
      }
    }
  );

  assert.equal(decision.decision, 'Actively reduce and review');
  assert.match(decision.managementFocus, /Business interruption range/i);
});
