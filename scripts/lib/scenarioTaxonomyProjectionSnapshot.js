'use strict';

const {
  SCENARIO_TAXONOMY_VERSION,
  SCENARIO_TAXONOMY_DOMAINS,
  SCENARIO_TAXONOMY_OVERLAYS,
  SCENARIO_TAXONOMY_FAMILIES
} = require('../../api/_scenarioTaxonomy');

const BROWSER_UNSUPPORTED_SIGNALS = Object.freeze([
  Object.freeze({
    key: 'ai_model_risk',
    pattern: '(?:^|[^a-z0-9])ai(?:$|[^a-z0-9])|model risk|responsible ai|hallucination|algorithmic bias|training data|\\bllm\\b|\\bgenai\\b',
    label: 'AI / model risk'
  })
]);

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildScenarioTaxonomyProjectionSnapshot() {
  return cloneJson({
    taxonomyVersion: SCENARIO_TAXONOMY_VERSION,
    domains: SCENARIO_TAXONOMY_DOMAINS,
    overlays: SCENARIO_TAXONOMY_OVERLAYS,
    families: SCENARIO_TAXONOMY_FAMILIES,
    unsupportedSignals: BROWSER_UNSUPPORTED_SIGNALS
  });
}

function formatScenarioTaxonomyProjectionDataSource(snapshot = buildScenarioTaxonomyProjectionSnapshot()) {
  return [
    '(function (globalScope) {',
    "  'use strict';",
    `  globalScope.__SCENARIO_TAXONOMY_PROJECTION_DATA__ = ${JSON.stringify(snapshot, null, 2)};`,
    "})(typeof window !== 'undefined' ? window : globalThis);",
    ''
  ].join('\n');
}

module.exports = {
  BROWSER_UNSUPPORTED_SIGNALS,
  buildScenarioTaxonomyProjectionSnapshot,
  formatScenarioTaxonomyProjectionDataSource
};
