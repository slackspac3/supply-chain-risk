#!/usr/bin/env node
'use strict';

const { AI_QUALITY_STEPS, APP_INTEGRITY_STEPS, runSteps } = require('./qa-shared');

runSteps(
  [...APP_INTEGRITY_STEPS, ...AI_QUALITY_STEPS],
  'QA release gate passed.'
);
