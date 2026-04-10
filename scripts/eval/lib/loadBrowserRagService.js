'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadBrowserRagService() {
  const rootDir = path.resolve(__dirname, '../../..');
  const servicePath = path.join(rootDir, 'assets/services/ragService.js');
  const source = `${fs.readFileSync(servicePath, 'utf8')}\nmodule.exports = RAGService;\n`;
  const context = {
    module: { exports: {} },
    exports: {},
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
  vm.runInNewContext(source, context, { filename: servicePath });

  const service = context.module.exports;
  const docs = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/docs.json'), 'utf8'));
  const businessUnits = JSON.parse(fs.readFileSync(path.join(rootDir, 'data/bu.json'), 'utf8'));
  service.init(docs, businessUnits);
  return service;
}

module.exports = {
  loadBrowserRagService
};
