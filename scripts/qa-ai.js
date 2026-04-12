#!/usr/bin/env node
'use strict';

const { AI_QUALITY_STEPS, runSteps } = require('./qa-shared');

runSteps(AI_QUALITY_STEPS, 'QA AI-quality gate passed.');
