#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const includeRoots = ['assets', 'api', 'scripts', 'tests'];
const excludeSegments = new Set(['node_modules', '.git', 'test-results', '_site', 'playwright-report']);
const failures = [];
const checked = [];

function walk(targetPath) {
  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    if (excludeSegments.has(entry.name)) continue;
    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;
    checked.push(path.relative(root, fullPath));
    const result = spawnSync(process.execPath, ['--check', fullPath], {
      cwd: root,
      encoding: 'utf8'
    });
    if (result.status !== 0) {
      failures.push({
        file: path.relative(root, fullPath),
        output: `${result.stdout || ''}${result.stderr || ''}`.trim()
      });
    }
  }
}

for (const dir of includeRoots) {
  const fullPath = path.join(root, dir);
  if (fs.existsSync(fullPath)) walk(fullPath);
}

if (failures.length) {
  console.error('Syntax check failed:');
  for (const failure of failures) {
    console.error(`- ${failure.file}`);
    if (failure.output) console.error(failure.output);
  }
  process.exit(1);
}

console.log(`Syntax check passed for ${checked.length} JavaScript files.`);
