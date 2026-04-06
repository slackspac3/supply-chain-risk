'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {
  buildScenarioTaxonomyProjectionSnapshot
} = require('../../scripts/lib/scenarioTaxonomyProjectionSnapshot');

function loadProjectionData() {
  const context = { console, globalThis: {} };
  context.window = context.globalThis;
  vm.createContext(context);
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../assets/services/scenarioTaxonomyProjectionData.js'),
    'utf8'
  );
  vm.runInContext(source, context, { filename: 'scenarioTaxonomyProjectionData.js' });
  return context.globalThis.__SCENARIO_TAXONOMY_PROJECTION_DATA__;
}

function loadProjection() {
  const context = { console, globalThis: {} };
  context.window = context.globalThis;
  vm.createContext(context);
  const files = [
    '../../assets/services/scenarioTaxonomyProjectionData.js',
    '../../assets/services/scenarioTaxonomyProjection.js'
  ];
  files.forEach((relativePath) => {
    const source = fs.readFileSync(path.resolve(__dirname, relativePath), 'utf8');
    vm.runInContext(source, context, { filename: path.basename(relativePath) });
  });
  return context.globalThis.ScenarioTaxonomyProjection;
}

test('projection version matches canonical server taxonomy version', () => {
  const projection = loadProjection();
  const taxonomy = require('../../api/_scenarioTaxonomy.js');
  assert.equal(projection.taxonomyVersion, taxonomy.SCENARIO_TAXONOMY_VERSION);
});

test('committed browser projection data matches the canonical serializer snapshot', () => {
  const committedData = JSON.parse(JSON.stringify(loadProjectionData()));
  const expectedSnapshot = buildScenarioTaxonomyProjectionSnapshot();
  assert.deepEqual(committedData, expectedSnapshot);
});

test('projection exposes the high-drift families needed for Step 1 hinting', () => {
  const projection = loadProjection();
  const families = [
    projection.familyByKey.identity_compromise,
    projection.familyByKey.availability_attack,
    projection.familyByKey.privacy_non_compliance,
    projection.familyByKey.delivery_slippage
  ];
  families.forEach((family) => assert.ok(family));
  assert.equal(projection.familyByKey.identity_compromise.lensKey, 'cyber');
  assert.equal(projection.familyByKey.delivery_slippage.lensKey, 'supply-chain');
});

test('projection keeps unsupported AI/model signals out of standard Step 1 hinting', () => {
  const projection = loadProjection();
  const classification = projection.classifyScenarioText(
    'DDoS traffic overwhelms the public website and degrades customer-facing services.',
    {}
  );
  assert.equal(classification.familyKey, 'availability_attack');
  assert.equal(projection.detectUnsupportedSignals('Responsible AI drift in a model workflow.').includes('ai_model_risk'), true);
});

test('projection retains compatibility aliases for lookup but only classifies active primary families', () => {
  const projection = loadProjection();
  assert.equal(projection.familyByKey.manual_error.status, 'compatibility_only');
  assert.equal(projection.familyByKey.manual_error.preferredFamilyKey, 'process_breakdown');

  const classification = projection.classifyScenarioText(
    'A manual processing error disrupts fulfilment and creates backlog.',
    { scenarioLensHint: 'manual_error' }
  );

  assert.equal(classification.familyKey, 'process_breakdown');
  assert.equal(projection.activeFamilies.some((family) => family.key === 'manual_error'), false);
});

test('projection competition keeps ransomware payment wording in cyber with strong separation', () => {
  const projection = loadProjection();
  const analysis = projection.evaluateScenarioCompetition(
    'Hackers encrypt company servers, halting operations and demanding a payment to unlock files.',
    {}
  );

  assert.equal(analysis.topFamilyKey, 'ransomware');
  assert.equal(analysis.classification.familyKey, 'ransomware');
  assert.equal(analysis.topLensKey, 'cyber');
  assert.equal(analysis.confidenceBand, 'high');
  assert.ok(analysis.separationScore > 3);
  assert.equal(analysis.topFamilies[1]?.familyKey, 'payment_control_failure');
});

test('projection competition keeps privacy-obligation wording in compliance rather than disclosure', () => {
  const projection = loadProjection();
  const analysis = projection.evaluateScenarioCompetition(
    'Customer records are retained for too long in breach of stated privacy obligations.',
    {}
  );

  assert.equal(analysis.topFamilyKey, 'privacy_non_compliance');
  assert.equal(analysis.classification.familyKey, 'privacy_non_compliance');
  assert.equal(analysis.topLensKey, 'compliance');
  assert.equal(analysis.topFamilies.some((family) => family.familyKey === 'data_disclosure'), false);
});

test('projection competition keeps supplier delay wording in the supply-chain lane', () => {
  const projection = loadProjection();
  const analysis = projection.evaluateScenarioCompetition(
    'A key supplier misses committed delivery dates and delays dependent projects.',
    {}
  );

  assert.equal(analysis.topFamilyKey, 'delivery_slippage');
  assert.equal(analysis.classification.familyKey, 'delivery_slippage');
  assert.equal(analysis.topLensKey, 'supply-chain');
  assert.equal(analysis.topFamilies.some((family) => family.lensKey === 'cyber'), false);
});

test('projection competition keeps workforce fatigue wording in the people-workforce lane', () => {
  const projection = loadProjection();
  const analysis = projection.evaluateScenarioCompetition(
    'Sustained understaffing and fatigue increase the likelihood of unsafe delivery.',
    {}
  );

  assert.equal(analysis.topFamilyKey, 'workforce_fatigue_staffing_weakness');
  assert.equal(analysis.classification.familyKey, 'workforce_fatigue_staffing_weakness');
  assert.equal(analysis.topLensKey, 'people-workforce');
  assert.equal(analysis.confidenceBand, 'high');
});

test('projection competition exposes ambiguity when mixed privacy and supplier-delay wording stays close', () => {
  const projection = loadProjection();
  const analysis = projection.evaluateScenarioCompetition(
    'Privacy obligations are breached because customer records are retained too long, while a supplier delay also slows dependent projects.',
    {}
  );

  assert.equal(analysis.topFamilyKey, 'delivery_slippage');
  assert.equal(analysis.topFamilies[1]?.familyKey, 'privacy_non_compliance');
  assert.equal(analysis.ambiguityFlags.includes('LOW_SEPARATION'), true);
  assert.equal(analysis.ambiguityFlags.includes('MIXED_TOP_FAMILIES'), true);
  assert.ok(analysis.confidenceScore < 0.7);
});
