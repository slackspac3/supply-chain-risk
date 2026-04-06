'use strict';

const fs = require('node:fs');
const path = require('node:path');

const {
  buildScenarioTaxonomyProjectionSnapshot,
  formatScenarioTaxonomyProjectionDataSource
} = require('./lib/scenarioTaxonomyProjectionSnapshot');

const PROJECTION_DATA_PATH = path.resolve(__dirname, '../assets/services/scenarioTaxonomyProjectionData.js');

function readCommittedProjectionSource() {
  return fs.existsSync(PROJECTION_DATA_PATH)
    ? fs.readFileSync(PROJECTION_DATA_PATH, 'utf8')
    : '';
}

function main() {
  const args = new Set(process.argv.slice(2));
  const checkOnly = args.has('--check');
  const writeMode = args.has('--write') || !checkOnly;
  const snapshot = buildScenarioTaxonomyProjectionSnapshot();
  const nextSource = formatScenarioTaxonomyProjectionDataSource(snapshot);
  const currentSource = readCommittedProjectionSource();

  if (checkOnly) {
    if (currentSource !== nextSource) {
      console.error('Scenario taxonomy projection drift detected.');
      console.error(`Projection file: ${PROJECTION_DATA_PATH}`);
      console.error('Regenerate it with: node scripts/sync-scenario-taxonomy-projection.js --write');
      process.exitCode = 1;
      return;
    }
    console.log(`Scenario taxonomy projection is in sync with ${snapshot.taxonomyVersion}.`);
    return;
  }

  if (currentSource === nextSource) {
    console.log(`Scenario taxonomy projection already matches ${snapshot.taxonomyVersion}.`);
    return;
  }

  if (!writeMode) {
    console.error('No mode selected. Use --check or --write.');
    process.exitCode = 1;
    return;
  }

  fs.writeFileSync(PROJECTION_DATA_PATH, nextSource);
  console.log(`Updated ${PROJECTION_DATA_PATH} from canonical taxonomy ${snapshot.taxonomyVersion}.`);
}

main();
