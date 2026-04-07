'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadProjection() {
  const context = { console, globalThis: {} };
  context.window = context.globalThis;
  vm.createContext(context);
  [
    '../../assets/services/scenarioTaxonomyProjectionData.js',
    '../../assets/services/scenarioTaxonomyProjection.js'
  ].forEach((relativePath) => {
    const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: path.basename(relativePath) });
  });
  return context.globalThis.ScenarioTaxonomyProjection;
}

const CONFIDENCE_RANK = Object.freeze({
  low: 0,
  medium: 1,
  high: 2
});

const NOVEL_WORDING_CASES = Object.freeze([
  {
    name: 'ransomware paraphrase recognises locked systems and extortion wording',
    text: 'Systems locked and attackers ask for money before core operations can resume.',
    expectedFamily: 'ransomware',
    expectedLens: 'cyber',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['payment_control_failure', 'payment_fraud']
  },
  {
    name: 'ransomware paraphrase recognises encrypted servers pending payment',
    text: 'Servers encrypted pending payment and service teams cannot restore normal access.',
    expectedFamily: 'ransomware',
    expectedLens: 'cyber',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['payment_control_failure', 'payment_fraud']
  },
  {
    name: 'retention paraphrase stays in records retention rather than disclosure',
    text: 'Records kept too long against privacy rules create a governance problem.',
    expectedFamily: 'records_retention_non_compliance',
    expectedLens: 'compliance',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['data_disclosure']
  },
  {
    name: 'cross-border transfer paraphrase stays in transfer governance lane',
    text: 'Data transferred abroad without safeguards creates an immediate privacy concern.',
    expectedFamily: 'cross_border_transfer_non_compliance',
    expectedLens: 'compliance',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['data_disclosure']
  },
  {
    name: 'supplier-delay paraphrase stays in delivery slippage rather than cyber',
    text: 'Key vendor delivery slips and blocks rollout for dependent projects.',
    expectedFamily: 'delivery_slippage',
    expectedLens: 'supply-chain',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['third_party_access_compromise', 'identity_compromise']
  },
  {
    name: 'workforce paraphrase stays in fatigue or staffing weakness instead of safety incident',
    text: 'Staff exhaustion creates unsafe delivery conditions across repeated shifts.',
    expectedFamily: 'workforce_fatigue_staffing_weakness',
    expectedLens: 'people-workforce',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['safety_incident']
  },
  {
    name: 'forced-labour paraphrase stays in ESG human-rights lane',
    text: 'Sub-tier supplier workers face forced labour conditions and abusive practices.',
    expectedFamily: 'forced_labour_modern_slavery',
    expectedLens: 'esg',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['supplier_control_weakness', 'single_source_dependency']
  },
  {
    name: 'greenwashing paraphrase stays in disclosure-gap lane',
    text: 'Public sustainability claims cannot be substantiated against actual operating practice.',
    expectedFamily: 'greenwashing_disclosure_gap',
    expectedLens: 'esg',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['policy_breach']
  },
  {
    name: 'hostile traffic saturation paraphrase stays in availability attack',
    text: 'Hostile traffic saturation knocks the customer portal offline.',
    expectedFamily: 'availability_attack',
    expectedLens: 'cyber',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['service_delivery_failure']
  },
  {
    name: 'payment-control paraphrase stays finance without deceptive fraud wording',
    text: 'Approval checks fail and a payment is released without the required control step.',
    expectedFamily: 'payment_control_failure',
    expectedLens: 'financial',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['payment_fraud']
  },
  {
    name: 'fraud paraphrase stays fraud-integrity when deception is explicit',
    text: 'A deceptive payment instruction causes a fraudulent transfer to be released.',
    expectedFamily: 'payment_fraud',
    expectedLens: 'fraud-integrity',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['payment_control_failure']
  },
  {
    name: 'third-party access weakness paraphrase stays in vendor-access weakness',
    text: 'Vendor accounts have broad access across critical systems without clear segregation.',
    expectedFamily: 'vendor_access_weakness',
    expectedLens: 'third-party',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['third_party_access_compromise', 'identity_compromise']
  },
  {
    name: 'third-party access weakness recognises support partner production reach wording',
    text: 'Support partner accounts can reach production systems through a shared external access path.',
    expectedFamily: 'vendor_access_weakness',
    expectedLens: 'third-party',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['third_party_access_compromise', 'identity_compromise']
  },
  {
    name: 'greenwashing wording recognises unsupported scope 2 reduction claims',
    text: 'Scope 2 reduction claims are unsupported because renewable energy attributes do not match the workload geography.',
    expectedFamily: 'greenwashing_disclosure_gap',
    expectedLens: 'esg',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['policy_breach', 'records_retention_non_compliance']
  },
  {
    name: 'third-party compromise paraphrase stays in access compromise rather than governance-only weakness',
    text: 'A vendor is compromised and uses broad access across critical systems.',
    expectedFamily: 'third_party_access_compromise',
    expectedLens: 'cyber',
    minimumConfidenceBand: 'medium',
    mustNotPrimary: ['vendor_access_weakness']
  }
]);

test('browser projection novel-wording eval pack stays robust across bounded paraphrases', async (t) => {
  const projection = loadProjection();

  for (const entry of NOVEL_WORDING_CASES) {
    await t.test(entry.name, () => {
      const analysis = projection.evaluateScenarioCompetition(entry.text, {});
      const promptSuggestions = projection.buildPromptIdeaSuggestions(analysis, { limit: 2 });

      assert.equal(analysis.classification.familyKey, entry.expectedFamily);
      assert.equal(analysis.topLensKey, entry.expectedLens);
      assert.ok(
        CONFIDENCE_RANK[String(analysis.confidenceBand || '').trim().toLowerCase()] >= CONFIDENCE_RANK[entry.minimumConfidenceBand],
        `Expected confidence band ${entry.minimumConfidenceBand}+ but saw ${analysis.confidenceBand || 'unknown'}`
      );
      assert.ok(
        promptSuggestions.some((suggestion) => suggestion.familyKey === entry.expectedFamily),
        `Expected prompt suggestions to include ${entry.expectedFamily}`
      );
      entry.mustNotPrimary.forEach((familyKey) => {
        assert.notEqual(analysis.classification.familyKey, familyKey);
      });
    });
  }
});

test('novel mixed delivery-versus-programme wording still exposes the programme runner-up to the browser', () => {
  const projection = loadProjection();
  const analysis = projection.evaluateScenarioCompetition(
    'A key vendor delay is now delaying the programme milestone and go-live plan.',
    {}
  );

  assert.equal(analysis.topFamilyKey, 'delivery_slippage');
  assert.ok(analysis.topFamilies.some((family) => family.familyKey === 'programme_delivery_slippage'));
  assert.ok(analysis.separationScore <= 1.5);
});
