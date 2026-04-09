'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBenchmarkService() {
  const filePath = path.resolve(__dirname, '../../assets/services/benchmarkService.js');
  const source = `${fs.readFileSync(filePath, 'utf8')}\n;globalThis.__BenchmarkService = BenchmarkService;`;
  const context = {
    console,
    URL,
    Date,
    Math,
    JSON,
    Promise,
    Set,
    Map,
    Array,
    RegExp,
    window: {}
  };
  context.global = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: filePath });
  return context.__BenchmarkService;
}

const benchmarks = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../data/benchmarks.json'), 'utf8'));

function initService() {
  const service = loadBenchmarkService();
  service.init(benchmarks);
  return service;
}

test('United States data-breach wording prefers the US breach profile over generic global entries', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Customer personal data was exposed and breach notification, legal review, and remediation are now underway.',
    geography: 'United States'
  });

  assert.equal(results[0].id, 'bm-databreach-us-ibm-2025');
});

test('United States payment-diversion wording prefers the US BEC benchmark', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'A spoofed executive email redirected supplier payment instructions and triggered an unauthorized wire transfer.',
    geography: 'United States'
  });

  assert.equal(results[0].id, 'bm-financial-bec-us-2024');
});

test('USA mailbox-compromise wording resolves to the US identity benchmark', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'A mailbox compromise exposed payroll records and enabled follow-on account takeover activity.',
    geography: 'USA'
  });

  assert.equal(results[0].id, 'bm-identity-us-ic3-2024');
});

test('IFRS-style ESG disclosure wording in the UAE prefers the UAE ESG disclosure profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Sustainability-related financial disclosures cannot be supported across governance, strategy, risk management, and metrics and targets.',
    geography: 'United Arab Emirates'
  });

  assert.equal(results[0].id, 'bm-esg-disclosure-uae-ifrs-2025');
});

test('United States sustainability-claims wording prefers the US greenwashing profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Public sustainability claims and climate benefit statements cannot be substantiated with underlying evidence.',
    geography: 'United States'
  });

  assert.equal(results[0].id, 'bm-esg-greenwashing-us-2024');
});

test('Human-rights abuse wording stays in ESG rather than procurement', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Workers report recruitment fees, passport retention, and weak remediation in a supplier labour-broker chain.',
    geography: 'United Arab Emirates'
  });

  assert.equal(results[0].scenarioType, 'esg');
  assert.equal(results[0].id, 'bm-esg-supplychain-rights-global-2026');
});

test('United States outage wording prefers the outage severity benchmark over global continuity guidance', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'A power event disrupted critical services for hours and recovery coordination remained weak during the outage.',
    geography: 'United States'
  });

  assert.equal(results[0].id, 'bm-businesscontinuity-outage-us-2025');
});

test('legacy benchmark source types are normalized into comparator labels and confidence bands', () => {
  const service = loadBenchmarkService();
  service.init([{
    id: 'bm-legacy-regional',
    title: 'Legacy regional comparator',
    scenarioType: 'identity',
    geographies: ['United States', 'Global'],
    industries: ['cross-sector'],
    scope: 'regional',
    sourceType: 'Regional benchmark',
    sourceTitle: 'Legacy source',
    sourceUrl: '',
    lastUpdated: '2025-01-01',
    summary: 'Regional comparator.',
    suggestedInputs: {
      TEF: { min: 0.2, likely: 0.8, max: 2 },
      controlStrength: { min: 0.4, likely: 0.6, max: 0.8 },
      threatCapability: { min: 0.4, likely: 0.6, max: 0.8 },
      lossComponents: {
        incidentResponse: { min: 1000, likely: 5000, max: 25000 },
        businessInterruption: { min: 1000, likely: 5000, max: 25000 },
        dataBreachRemediation: { min: 1000, likely: 5000, max: 25000 },
        regulatoryLegal: { min: 1000, likely: 5000, max: 25000 },
        thirdPartyLiability: { min: 1000, likely: 5000, max: 25000 },
        reputationContract: { min: 1000, likely: 5000, max: 25000 }
      }
    }
  }]);

  const results = service.retrieveRelevantBenchmarks({
    query: 'Mailbox compromise and account takeover hit a United States business.',
    geography: 'United States'
  });
  const reference = service.buildReferenceList(results)[0];

  assert.equal(reference.sourceType, 'benchmark');
  assert.equal(reference.scope, 'regional');
  assert.equal(reference.sourceTypeLabel, 'Regional benchmark');
  assert.equal(reference.confidenceLabel, 'Strong comparator');
});

test('United States retaliation and hotline wording prefers the U.S. compliance profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'A whistleblower hotline report alleged retaliation after an internal investigation into gifts and entertainment controls.',
    geography: 'United States'
  });

  assert.equal(results[0].id, 'bm-compliance-us-retaliation-2026');
});

test('United States records-of-processing wording prefers the U.S. data-governance profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Records of processing, retention controls, and approved-use oversight failed for regulated customer and employee data.',
    geography: 'United States'
  });

  assert.equal(results[0].id, 'bm-data-governance-us-records-2026');
});

test('UAE worker-welfare wording prefers the UAE workforce profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Worker welfare, fatigue, and accommodation concerns are affecting staffing resilience and safe delivery.',
    geography: 'United Arab Emirates'
  });

  assert.equal(results[0].id, 'bm-people-workforce-uae-welfare-2026');
});

test('United States supplier concentration wording prefers the U.S. supply-chain profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'A single-source supplier dependency is delaying critical deliveries and increasing substitute-cost pressure.',
    geography: 'United States'
  });

  assert.equal(results[0].id, 'bm-supplychain-us-dependency-2026');
});

test('UAE service degradation wording prefers the UAE operational-resilience profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Service degradation, manual fallback, backlog growth, and weak recovery governance are delaying restoration.',
    geography: 'United Arab Emirates'
  });

  assert.equal(results[0].id, 'bm-operational-uae-service-governance-2026');
});

test('United States sourcing-integrity wording prefers the U.S. procurement profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Vendor-selection diligence failed, conflicts of interest were missed, and the tender path was not challenged properly.',
    geography: 'United States'
  });

  assert.equal(results[0].id, 'bm-procurement-us-diligence-2026');
});

test('United Kingdom conduct wording prefers the UK compliance profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'A speak-up case alleges retaliation, weak investigation follow-through, and gifts-and-hospitality control failure.',
    geography: 'United Kingdom'
  });

  assert.equal(results[0].id, 'bm-compliance-uk-conduct-2026');
});

test('India outage wording prefers the India continuity profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Critical services were disrupted, failover was weak, and recovery objectives were missed during the outage.',
    geography: 'India'
  });

  assert.equal(results[0].id, 'bm-businesscontinuity-india-outage-2026');
});

test('Asia Pacific records-of-processing wording prefers the APAC data-governance profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Records of processing, retention control, and approved-use governance failed across regulated personal data.',
    geography: 'Asia Pacific'
  });

  assert.equal(results[0].id, 'bm-data-governance-apac-privacy-2026');
});

test('North Africa service-recovery wording prefers the North Africa operational profile', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Manual fallback, backlog growth, and weak restoration governance are degrading service recovery.',
    geography: 'North Africa'
  });

  assert.equal(results[0].id, 'bm-operational-northafrica-service-2026');
});

test('Dubai requests are normalised through UAE comparator data and called out clearly', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Critical services were disrupted and recovery coordination stayed weak during the outage.',
    geography: 'Dubai'
  });
  const references = service.buildReferenceList(results);
  const basis = service.summariseBenchmarkBasis(results);

  assert.equal(results[0].scenarioType, 'business-continuity');
  assert.equal(results[0].geographyMatch, 'United Arab Emirates');
  assert.equal(references[0].coverageType, 'national-proxy');
  assert.equal(references[0].coverageLabel, 'National proxy');
  assert.match(basis, /dubai/i);
  assert.match(basis, /united arab emirates/i);
});

test('United Kingdom scenarios fall back to global benchmark guidance when no direct regional match exists', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'A power event disrupted critical services and recovery objectives were missed during the outage.',
    geography: 'United Kingdom'
  });
  const references = service.buildReferenceList(results);
  const provenance = service.buildInputProvenance(results);
  const basis = service.summariseBenchmarkBasis(results);

  assert.equal(results[0].scenarioType, 'business-continuity');
  assert.equal(references[0].coverageType, 'global-fallback');
  assert.equal(references[0].coverageLabel, 'Global best practice');
  assert.equal(provenance[0].origin, 'Global best-practice comparator');
  assert.match(basis, /global best-practice comparator data was used/i);
});

test('multi-region assessments blend primary benchmark inputs evenly and call it out clearly', () => {
  const service = initService();
  const results = service.retrieveRelevantBenchmarks({
    query: 'Customer personal data was exposed and breach notification, legal review, and remediation are now underway.',
    geography: 'United Arab Emirates, United States',
    topK: 4
  });
  const primaries = results.filter(entry => entry.selectionRole === 'primary');
  const suggested = service.deriveSuggestedInputs(results);
  const basis = service.summariseBenchmarkBasis(results);
  const references = service.buildReferenceList(results);
  const expectedLikely = Number((
    primaries.reduce((sum, entry) => sum + Number(entry.suggestedInputs.TEF.likely || 0), 0) / primaries.length
  ).toFixed(4));

  assert.equal(primaries.length, 2);
  assert.deepEqual(Array.from(primaries, entry => entry.id).sort(), ['bm-databreach-me-ibm-2023', 'bm-databreach-us-ibm-2025']);
  assert.equal(suggested.TEF.likely, expectedLikely);
  assert.match(basis, /normalised evenly across the selected geographies/i);
  assert.ok(references.some(ref => ref.coverageLabel === 'Multi-region input'));
});

test('supported user geographies always resolve to a benchmark fit label for core scenario families', () => {
  const service = initService();
  const geographies = [
    'United Arab Emirates',
    'Abu Dhabi',
    'Dubai',
    'GCC',
    'Saudi Arabia',
    'Qatar',
    'Kuwait',
    'Bahrain',
    'Oman',
    'Middle East',
    'North Africa',
    'Europe',
    'United Kingdom',
    'United States',
    'India',
    'Asia Pacific',
    'Global'
  ];
  const queries = [
    'Customer personal data was exposed and breach notification, legal review, and remediation are now underway.',
    'Critical services were disrupted and recovery coordination remained weak during the outage.',
    'Public sustainability claims and climate benefit statements cannot be substantiated with underlying evidence.',
    'Vendor-selection diligence failed, conflicts of interest were missed, and the tender path was not challenged properly.'
  ];

  for (const geography of geographies) {
    for (const query of queries) {
      const results = service.retrieveRelevantBenchmarks({ query, geography });
      const reference = service.buildReferenceList(results)[0];
      assert.ok(results.length > 0, `${geography} should return at least one benchmark result`);
      assert.ok(reference.coverageLabel, `${geography} should expose a geography fit label`);
      assert.ok(reference.coverageSummary, `${geography} should explain the geography fit`);
    }
  }
});
