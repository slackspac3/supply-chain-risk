'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeSheetName,
  isPrimaryRiskRegisterSheetName,
  selectRegisterWorkbookSheets
} = require('../../assets/state/registerWorkbookSelector.js');

test('normalizeSheetName strips numbering prefixes and casing noise', () => {
  assert.equal(normalizeSheetName('1. Risk Register'), 'risk register');
  assert.equal(normalizeSheetName(' 02 - RISK   REGISTER '), 'risk register');
});

test('isPrimaryRiskRegisterSheetName matches numbered risk register tabs', () => {
  assert.equal(isPrimaryRiskRegisterSheetName('1. Risk Register'), true);
  assert.equal(isPrimaryRiskRegisterSheetName('Risk Register'), true);
  assert.equal(isPrimaryRiskRegisterSheetName('Other Risks'), false);
});

test('selectRegisterWorkbookSheets prefers the primary risk register tab over the rest of the workbook', () => {
  const selection = selectRegisterWorkbookSheets([
    { sheetName: '1. Risk Register', rowCount: 120, text: 'risk rows' },
    { sheetName: 'Other Risks', rowCount: 50, text: 'other rows' },
    { sheetName: 'Loss Exceedance Curve', rowCount: 1000, text: 'curve rows' }
  ]);

  assert.equal(selection.selectionMode, 'exact_risk_register');
  assert.deepEqual(selection.selectedSheets.map(sheet => sheet.sheetName), ['1. Risk Register']);
  assert.deepEqual(selection.ignoredSheets.map(sheet => sheet.sheetName), ['Other Risks', 'Loss Exceedance Curve']);
});

test('selectRegisterWorkbookSheets falls back to all sheets when no risk register tab exists', () => {
  const selection = selectRegisterWorkbookSheets([
    { sheetName: 'Operational Risks', rowCount: 20, text: 'ops rows' },
    { sheetName: 'Loss Exceedance Curve', rowCount: 1000, text: 'curve rows' }
  ]);

  assert.equal(selection.selectionMode, 'all_sheets');
  assert.deepEqual(selection.selectedSheets.map(sheet => sheet.sheetName), ['Operational Risks', 'Loss Exceedance Curve']);
  assert.deepEqual(selection.ignoredSheets, []);
});
