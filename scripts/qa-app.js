#!/usr/bin/env node
'use strict';

const { APP_INTEGRITY_STEPS, runSteps } = require('./qa-shared');

runSteps(APP_INTEGRITY_STEPS, 'QA app-integrity gate passed.');
