'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const VendorRiskTemplateService = require('../../assets/services/vendorRiskTemplateService.js');

test('catalog exposes the seeded GTR InfoSec readiness questionnaire with stable counts', () => {
  const catalog = VendorRiskTemplateService.getTemplateCatalog();
  assert.equal(Array.isArray(catalog), true);
  assert.equal(catalog.length, 1);
  assert.deepEqual(catalog[0], {
    id: 'gtr_vendor_infosec_readiness_v1',
    title: 'GTR Vendor Information Security Readiness Assessment',
    version: '1.0.0-poc',
    questionnaireType: 'infosec_readiness',
    sectionCount: 5,
    questionCount: 34,
    evidenceBearingQuestionCount: 28
  });
});

test('questionnaire retrieval returns a defensive clone', () => {
  const first = VendorRiskTemplateService.getQuestionnaireTemplate();
  first.sections[0].title = 'Mutated';
  first.sections[0].questions[0].prompt = 'Mutated prompt';

  const second = VendorRiskTemplateService.getQuestionnaireTemplate();
  assert.equal(second.sections[0].title, 'About You And Your Proposed Arrangement With Us');
  assert.equal(
    second.sections[0].questions[0].prompt,
    'Please provide your name and function within your organisation.'
  );
});

test('workflow model preserves separate reviewer and approver steps for the PoC', () => {
  const workflowModel = VendorRiskTemplateService.getWorkflowModel();
  assert.equal(workflowModel.reviewSequence[1].role, 'reviewer');
  assert.equal(workflowModel.reviewSequence.at(-1).role, 'approver');
  assert.equal(workflowModel.casePolicies.contractChangeReuseExistingCase, true);
  assert.equal(workflowModel.casePolicies.newContractRequiresNewCase, true);
});

test('privacy and legal checklist templates are available as dedicated review checklists', () => {
  const privacyChecklist = VendorRiskTemplateService.getReviewChecklistTemplate('privacy');
  const legalChecklist = VendorRiskTemplateService.getReviewChecklistTemplate('legal');

  assert.equal(privacyChecklist.title, 'Privacy Review Checklist');
  assert.equal(privacyChecklist.items.length, 5);
  assert.equal(legalChecklist.title, 'Legal Review Checklist');
  assert.equal(legalChecklist.items.length, 5);
});

test('default case records reflect new-contract and contract-change policy differences', () => {
  const newContractCase = VendorRiskTemplateService.buildDefaultCaseRecord({
    caseId: 'case-new',
    caseType: 'new_contract',
    invitedVendorContactEmail: 'Vendor@example.com'
  });
  const contractChangeCase = VendorRiskTemplateService.buildDefaultCaseRecord({
    caseId: 'case-change',
    caseType: 'contract_change',
    invitedVendorContactEmail: 'Vendor@example.com'
  });

  assert.equal(newContractCase.cycleType, 'initial');
  assert.equal(contractChangeCase.cycleType, 'change_request');
  assert.equal(newContractCase.vendorAccess.invitedVendorContactEmail, 'vendor@example.com');
  assert.equal(contractChangeCase.vendorAccess.invitedContactOnly, true);
});

test('intake template exposes the analyst-provided stage-1 fields and derived outputs', () => {
  const intakeTemplate = VendorRiskTemplateService.getIntakeTemplate();
  assert.equal(intakeTemplate.id, 'gtr_vendor_vrm_intake_v1');
  assert.equal(intakeTemplate.fields[1].id, 'serviceScope');
  assert.equal(intakeTemplate.fields[2].id, 'dataAccessRequired');
  assert.equal(intakeTemplate.derivedOutputs.includes('criticalityTier'), true);
});

test('service-type inference and intake output framing reflect analyst guidance', () => {
  const output = VendorRiskTemplateService.buildIntakeOutputFrame({
    contractDescription: 'Managed AI SaaS platform for finance analytics',
    serviceScope: 'Hosted AI platform with model workflows',
    dataAccessRequired: 'yes',
    dataTypes: ['PII', 'Finance_Details'],
    headquartered: 'UAE',
    hostingRegion: 'Germany',
    subprocessors: [{ name: 'CloudHost', location: 'Germany' }]
  });

  assert.equal(output.serviceType, 'ai');
  assert.deepEqual(output.dataAccess.dataTypes, ['pii', 'finance_details']);
  assert.deepEqual(output.regulatoryImpact, ['privacy', 'financial', 'ai_governance', 'cross_border_and_residency']);
  assert.equal(output.criticalityTier, 'pending_scoring');
  assert.equal(output.serviceProfile.deepDiveTopics.includes('model governance'), true);
});

test('risk control checkpoints map analyst tiers to required actions', () => {
  const highCheckpoint = VendorRiskTemplateService.getRiskControlCheckpoint('tier_1_critical');
  const mediumCheckpoint = VendorRiskTemplateService.getRiskControlCheckpoint('tier_2_important');
  const lowCheckpoint = VendorRiskTemplateService.getRiskControlCheckpoint('tier_3_low_risk');

  assert.equal(highCheckpoint.label, 'High');
  assert.match(highCheckpoint.action, /must-have controls/i);
  assert.equal(mediumCheckpoint.checkpoint, 'exception_approval');
  assert.equal(lowCheckpoint.checkpoint, 'autoapproved');
});

test('clause recommendation frame tailors mandatory packs by service type and operating model', () => {
  const aiFrame = VendorRiskTemplateService.buildClauseRecommendationFrame({
    contractDescription: 'GenAI assistant platform',
    serviceScope: 'AI hosted service',
    dataAccessRequired: true,
    dataTypes: ['PII'],
    headquartered: 'UAE',
    hostingRegion: 'UAE',
    subprocessors: []
  });
  const consultingFrame = VendorRiskTemplateService.buildClauseRecommendationFrame({
    contractDescription: 'Cyber consulting and advisory services',
    serviceScope: 'Consulting',
    dataAccessRequired: false,
    dataTypes: [],
    headquartered: 'UAE',
    subprocessors: []
  });
  const saasCrossBorderFrame = VendorRiskTemplateService.buildClauseRecommendationFrame({
    contractDescription: 'SaaS platform',
    serviceScope: 'Hosted SaaS application',
    dataAccessRequired: true,
    dataTypes: ['Finance_Details'],
    headquartered: 'UAE',
    hostingRegion: 'Germany',
    subprocessors: [{ name: 'CloudHost', location: 'Germany' }]
  });

  assert.deepEqual(aiFrame.packIds, ['baseline_security', 'ai_usage', 'data_transfer_and_subprocessors']);
  assert.deepEqual(consultingFrame.packIds, ['baseline_security', 'consulting_delivery']);
  assert.deepEqual(saasCrossBorderFrame.packIds, ['baseline_security', 'saas_hosting', 'data_transfer_and_subprocessors']);
});
