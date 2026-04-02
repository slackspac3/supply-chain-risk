'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLlmServiceContext } = require('./helpers/loadLlmServiceHarness');

function loadLlmInternals() {
  let instrumentedSuccessfully = false;
  const context = loadLlmServiceContext({
    origin: 'http://127.0.0.1:8080',
    fetchImpl: async () => {
      throw new Error('fetch should not be called in llmServiceClassification.test.js');
    },
    transformLlmService(source) {
      const instrumented = source.replace(
        '  return {\n    buildGuidedScenarioDraft,',
        '  globalThis.__llmInternals = { _classifyScenario, _extractRiskCandidates, _evaluateGuidedDraftCandidate, _filterPromptIdeaCandidates, _buildContextPromptBlock, _buildScenarioContextResolution, _getAiFeedbackLearningProfile, _rerankRisksWithFeedback };\n\n  return {\n    buildGuidedScenarioDraft,'
      );
      instrumentedSuccessfully = instrumented !== source;
      return instrumented;
    }
  });
  assert.equal(instrumentedSuccessfully, true, 'Failed to instrument llmService internals for test access');
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

test('supplier delivery slippage for infrastructure deployment stays out of procurement and into delivery risk', () => {
  const internals = loadLlmInternals();
  const text = 'A key server supplier misses a committed delivery date, delaying planned infrastructure deployment and dependent business projects.';
  const classification = internals._classifyScenario(text, {
    guidedInput: {
      event: text,
      asset: 'Infrastructure deployment',
      cause: 'Supplier delivery miss',
      impact: 'Dependent business project delay'
    }
  });

  assert.equal(classification.key, 'transformation-delivery');

  const risks = internals._extractRiskCandidates(text, {
    lensHint: { key: 'operational', label: 'Operational' }
  });

  assert.equal(risks[0]?.key, 'transformation-delivery');
  assert.equal(risks.some((risk) => risk.key === 'procurement'), false);
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

test('evaluateGuidedDraftCandidate rejects procurement framing for supplier delivery slippage', () => {
  const internals = loadLlmInternals();
  const candidate = internals._evaluateGuidedDraftCandidate(
    'High-urgency Procurement scenario: A key server supplier misses a committed delivery date, delaying planned infrastructure deployment and dependent business projects. The area most exposed is the sourcing decision and contract award path. If this develops, it could create commercial overpayment and award challenge.',
    {
      seedNarrative: 'High-urgency Operational scenario: A key server supplier misses a committed delivery date, delaying planned infrastructure deployment and dependent business projects. The area most exposed is the delivery dependency and deployment timeline. If this develops, it could create milestone slippage and pressure on downstream business commitments.',
      guidedInput: {
        event: 'A key server supplier misses a committed delivery date, delaying planned infrastructure deployment and dependent business projects.',
        asset: 'Infrastructure deployment',
        cause: 'Supplier delivery miss',
        impact: 'Dependent business project delay'
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

test('buildContextPromptBlock makes resolved direct and inherited obligations explicit', () => {
  const internals = loadLlmInternals();
  const block = internals._buildContextPromptBlock({
    businessUnitContext: 'Subsidiary technology context',
    resolvedObligationContext: {
      direct: [
        {
          title: 'Local cyber incident reporting',
          sourceEntityName: 'Operating company',
          text: 'Critical cyber events must be reported to the local regulator.'
        }
      ],
      inheritedMandatory: [
        {
          title: 'Group privileged access standard',
          sourceEntityName: 'Holding company',
          text: 'Privileged access reviews must follow the group standard.'
        }
      ],
      inheritedConditional: [],
      inheritedGuidance: [],
      allResolved: [],
      summary: 'Direct obligations and inherited group obligations are active.'
    }
  });

  assert.match(block, /Resolved obligation basis/i);
  assert.match(block, /Direct obligations:/i);
  assert.match(block, /Inherited mandatory obligations:/i);
  assert.match(block, /Group privileged access standard/i);
});

test('buildScenarioContextResolution carries resolved obligations as approved context', () => {
  const internals = loadLlmInternals();
  const resolution = internals._buildScenarioContextResolution({
    narrative: 'Privileged administrator credentials were used to access the tenant and change critical configurations.',
    guidedInput: {
      event: 'Privileged administrator credentials were used to access the tenant and change critical configurations.',
      asset: 'Directory tenant',
      cause: 'Credential exposure',
      impact: 'Service disruption and control failure'
    },
    businessUnit: { name: 'Technology' },
    adminSettings: {
      resolvedObligationContext: {
        direct: [],
        inheritedMandatory: [
          {
            title: 'Group privileged access standard',
            sourceEntityName: 'Holding company',
            text: 'Privileged access reviews must follow the group standard.'
          }
        ],
        inheritedConditional: [],
        inheritedGuidance: [],
        allResolved: [],
        summary: 'Inherited group obligations are active.'
      }
    },
    geography: 'United Arab Emirates',
    applicableRegulations: ['UAE PDPL']
  });

  assert.match(resolution.approvedContext.obligations, /Group privileged access standard/i);
  assert.equal(
    resolution.applies.some((item) => item.kind === 'obligations'),
    true
  );
});

test('browser-side learning profile lookup is disabled for authoritative inference use', async () => {
  const internals = loadLlmInternals();
  const profile = await internals._getAiFeedbackLearningProfile({
    businessUnitId: 'g42',
    functionKey: 'technology',
    scenarioLensKey: 'cyber'
  });

  assert.equal(profile, null);
});

test('browser-side risk reranking is neutralized when learning authority moved server-side', () => {
  const internals = loadLlmInternals();
  const risks = [
    { title: 'Generic service instability' },
    { title: 'Privileged account compromise' }
  ];

  const reranked = internals._rerankRisksWithFeedback(risks, {
    combined: {
      riskWeights: { 'Privileged account compromise': 2 }
    }
  });

  assert.deepEqual(reranked, risks);
});
