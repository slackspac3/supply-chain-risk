'use strict';

(function attachVendorRiskTemplateService(globalScope) {
  const TEMPLATE_IDS = Object.freeze({
    INFOSEC_READINESS: 'gtr_vendor_infosec_readiness_v1',
    VRM_INTAKE: 'gtr_vendor_vrm_intake_v1'
  });

  const CHECKLIST_IDS = Object.freeze({
    REVIEWER: 'gtr_vendor_reviewer_checklist_v1',
    PRIVACY: 'gtr_vendor_privacy_checklist_v1',
    LEGAL: 'gtr_vendor_legal_checklist_v1',
    APPROVER: 'gtr_vendor_approver_checklist_v1'
  });

  const CASE_TYPES = Object.freeze([
    'new_contract',
    'contract_change',
    'periodic_reassessment',
    'exception_handling'
  ]);

  const CYCLE_TYPES = Object.freeze([
    'initial',
    'change_request',
    'periodic',
    'exception'
  ]);

  const QUESTION_STATUS_OPTIONS = Object.freeze([
    { id: 'yes', label: 'Yes' },
    { id: 'no', label: 'No' },
    { id: 'dont_know', label: "Don't know" }
  ]);

  const SERVICE_TYPE_PROFILES = Object.freeze({
    ai: {
      id: 'ai',
      label: 'AI',
      deepDiveTopics: [
        'model governance',
        'training and inference data handling',
        'access control',
        'logging and monitoring',
        'subprocessor and hosting visibility'
      ]
    },
    saas: {
      id: 'saas',
      label: 'SaaS',
      deepDiveTopics: [
        'cloud controls',
        'encryption',
        'logs and monitoring',
        'access management',
        'hosting location'
      ]
    },
    consulting: {
      id: 'consulting',
      label: 'Consulting',
      deepDiveTopics: [
        'nda coverage',
        'security training',
        'endpoint security when devices are not G42-managed',
        'idam requirements'
      ]
    },
    technology_provider: {
      id: 'technology_provider',
      label: 'Technology Provider',
      deepDiveTopics: [
        'technology provenance',
        'software integrity',
        'subprocessor and upstream dependency visibility',
        'patch and vulnerability management'
      ]
    },
    hardware: {
      id: 'hardware',
      label: 'Hardware',
      deepDiveTopics: [
        'device provenance',
        'firmware integrity',
        'supply chain and manufacturing location',
        'support and maintenance controls'
      ]
    }
  });

  const CONTRACT_CLAUSE_PACKS = Object.freeze({
    baseline_security: {
      id: 'baseline_security',
      title: 'Baseline Information Security Clauses',
      appliesTo: ['ai', 'saas', 'consulting', 'technology_provider', 'hardware'],
      clauses: [
        'Background checks and security training',
        'Technical and organisational security measures',
        'Security incident management and notification',
        'Security monitoring and audit cooperation',
        'Compliance with legal and regulatory requirements',
        'Data deletion and retention',
        'Cybersecurity insurance and liability'
      ]
    },
    saas_hosting: {
      id: 'saas_hosting',
      title: 'SaaS Hosting And Resilience Clauses',
      appliesTo: ['saas'],
      clauses: [
        'Cloud hosting and location change management',
        'Availability and resilience including uptime, RTO, and RPO',
        'Logging, monitoring, and remote access controls',
        'Network infrastructure transparency',
        'Access controls and role management'
      ]
    },
    ai_usage: {
      id: 'ai_usage',
      title: 'AI And GenAI Clauses',
      appliesTo: ['ai'],
      clauses: [
        'Governance of GenAI tool usage',
        'Documentation of methodologies and data sources',
        'Data ownership and custodianship for prompts, inputs, and outputs',
        'Indemnity for unlawful or improper AI use'
      ]
    },
    consulting_delivery: {
      id: 'consulting_delivery',
      title: 'Consulting Delivery Clauses',
      appliesTo: ['consulting'],
      clauses: [
        'Background checks and security training for delivery personnel',
        'Restrictions on removal of physical information assets from G42 premises',
        'Endpoint and remote access security for non-G42-managed devices',
        'Access control and role management for assigned personnel'
      ]
    },
    technology_and_endpoint: {
      id: 'technology_and_endpoint',
      title: 'Technology Provider And Endpoint Clauses',
      appliesTo: ['technology_provider', 'hardware'],
      clauses: [
        'Perimeter and endpoint security',
        'Network infrastructure transparency',
        'Technical and organisational security measures',
        'Security monitoring and audit'
      ]
    },
    data_transfer_and_subprocessors: {
      id: 'data_transfer_and_subprocessors',
      title: 'Data Transfer, Hosting, And Subprocessor Clauses',
      appliesTo: ['ai', 'saas', 'consulting', 'technology_provider', 'hardware'],
      clauses: [
        'Hosting location approval and change control',
        'Subprocessor disclosure and location transparency',
        'Cross-border data handling controls',
        'Regulatory cooperation and supporting evidence on request'
      ]
    }
  });

  const REGULATORY_MATRIX_COLUMNS = Object.freeze([
    { id: 'requirement', label: 'Legal or regulatory requirement', type: 'text', required: true },
    { id: 'currentlyCompliant', label: 'Currently compliant', type: 'enum', options: QUESTION_STATUS_OPTIONS, required: true },
    { id: 'willBeCompliant', label: 'Will be compliant', type: 'enum', options: QUESTION_STATUS_OPTIONS, required: true },
    { id: 'comment', label: 'Comment', type: 'long_text', required: false }
  ]);

  const STANDARD_MATRIX_COLUMNS = Object.freeze([
    { id: 'standardName', label: 'Internationally recognised standard', type: 'text', required: true },
    { id: 'compliantSince', label: 'Compliant since', type: 'date_text', required: false },
    { id: 'lastAuditDate', label: 'Date of last audit', type: 'date_text', required: false },
    { id: 'comment', label: 'Comment', type: 'long_text', required: false },
    { id: 'evidenceReference', label: 'Evidence reference', type: 'text', required: false }
  ]);

  const INFOSEC_GOVERNANCE_ITEMS = Object.freeze([
    ['3.1.1', 'corporate_information_security_policy', 'There is a corporate information security policy.'],
    ['3.1.2', 'corporate_information_security_management_system', 'There is a corporate information security management system.'],
    ['3.1.3', 'information_security_roles_exist', 'There are information security functions and roles in place.'],
    ['3.1.4', 'business_continuity_for_critical_functions', 'Business continuity is assured for critical business functions.']
  ]);

  const INFOSEC_CONTROL_ITEMS = Object.freeze([
    ['3.3.1', 'user_authentication_required', 'All users must be authenticated to access corporate IT systems.'],
    ['3.3.2', 'remote_user_mfa', 'Remote users of IT systems require two-factor authentication.'],
    ['3.3.3', 'known_devices_only', 'Only known devices can connect to the corporate network.'],
    ['3.3.4', 'password_policy_enforced', 'Password complexity and expiry are prescribed by policy. Those rules are enforced and compliance is monitored.'],
    ['3.3.5', 'background_screening', 'Staff are subject to background screening according to their role.'],
    ['3.3.6', 'mobile_device_data_protection', 'Data on mobile devices is protected in the event of physical loss.'],
    ['3.3.7', 'anti_malware_and_browsing_controls', 'All IT systems have anti-malware and Internet browsing controls installed.'],
    ['3.3.8', 'byod_controlled_or_prohibited', 'Employees use their personal devices to securely access and process company data, or they are prohibited from doing so.'],
    ['3.3.9', 'patching_governed', 'Systems are patched promptly; exceptions are risk assessed and governed by an established management process.'],
    ['3.3.10', 'pii_access_controlled', 'Access to and processing of PII is controlled under regulatory requirements.'],
    ['3.3.11', 'obsolete_equipment_data_disposal', 'Data is irrecoverably deleted from obsolete equipment.'],
    ['3.3.12', 'cryptographic_keys_managed', 'Keys for cryptographic protection are protected and securely managed.'],
    ['3.3.13', 'sensitive_information_labelled', 'Sensitive information is labelled consistently and properly.'],
    ['3.3.14', 'access_restricted_by_need', 'Access to sensitive information is restricted according to business need.'],
    ['3.3.15', 'remote_backup', 'Important data is routinely backed up to a remote location.'],
    ['3.3.16', 'approved_applications_only', 'Users only run approved applications on corporate IT systems.'],
    ['3.3.17', 'third_party_policies_apply', 'Mandatory corporate security policies apply to all third parties.'],
    ['3.3.18', 'security_by_design', 'Security is built in during the design of business applications.'],
    ['3.3.19', 'regular_assessment_and_pentest', 'Systems are subject to regular assessment and penetration testing.']
  ]);

  const REVIEW_CHECKLIST_TEMPLATES = Object.freeze({
    [CHECKLIST_IDS.REVIEWER]: {
      id: CHECKLIST_IDS.REVIEWER,
      role: 'reviewer',
      title: 'Reviewer Checklist',
      items: [
        { id: 'scope_complete', prompt: 'Assessment scope matches the product or service actually being procured.', required: true },
        { id: 'criticality_supported', prompt: 'Criticality selection is supported by the intake, questionnaire responses, and evidence.', required: true },
        { id: 'control_gaps_captured', prompt: 'All material security control gaps have been translated into risk statements or explicit observations.', required: true },
        { id: 'vendor_followups_clear', prompt: 'Vendor clarifications and evidence requests are specific enough for a follow-up round.', required: true }
      ]
    },
    [CHECKLIST_IDS.PRIVACY]: {
      id: CHECKLIST_IDS.PRIVACY,
      role: 'privacy',
      title: 'Privacy Review Checklist',
      items: [
        { id: 'personal_data_confirmed', prompt: 'The assessment identifies whether personal data is accessed, stored, processed, or transferred.', required: true },
        { id: 'cross_border_reviewed', prompt: 'Cross-border transfer and data residency implications have been reviewed.', required: true },
        { id: 'subprocessor_visibility', prompt: 'Sub-processors and onward transfer dependencies are disclosed where relevant.', required: true },
        { id: 'retention_controls', prompt: 'Retention, deletion, and data subject rights handling are addressed.', required: true },
        { id: 'privacy_contract_requirements', prompt: 'Required privacy obligations or addenda are captured for contracting.', required: true }
      ]
    },
    [CHECKLIST_IDS.LEGAL]: {
      id: CHECKLIST_IDS.LEGAL,
      role: 'legal',
      title: 'Legal Review Checklist',
      items: [
        { id: 'jurisdiction_confirmed', prompt: 'Jurisdiction and governing-law risks are reviewed for the proposed operating model.', required: true },
        { id: 'security_clauses_ready', prompt: 'Required information security clauses are identified for the agreement.', required: true },
        { id: 'audit_and_notice_rights', prompt: 'Audit rights, breach notice obligations, and remediation expectations are contractually addressed.', required: true },
        { id: 'subcontracting_restrictions', prompt: 'Subcontracting, change control, and approval restrictions are captured where needed.', required: true },
        { id: 'risk_acceptance_path_clear', prompt: 'Any residual-risk or addendum path is clear before approval.', required: true }
      ]
    },
    [CHECKLIST_IDS.APPROVER]: {
      id: CHECKLIST_IDS.APPROVER,
      role: 'approver',
      title: 'Approver Checklist',
      items: [
        { id: 'findings_understood', prompt: 'The approval decision reflects the documented findings and residual-risk position.', required: true },
        { id: 'risk_response_selected', prompt: 'The intended response is clear: pass, conditional pass, or fail.', required: true },
        { id: 'conditions_documented', prompt: 'Conditional approval requirements and timelines are documented when used.', required: true }
      ]
    }
  });

  const WORKFLOW_MODEL = Object.freeze({
    roles: [
      'admin',
      'gtr_analyst',
      'reviewer',
      'approver',
      'procurement',
      'privacy',
      'legal',
      'vendor_contact'
    ],
    caseTypes: CASE_TYPES,
    cycleTypes: CYCLE_TYPES,
    caseStatuses: [
      'intake',
      'vendor_in_progress',
      'internal_review',
      'awaiting_vendor_clarification',
      'approval_pending',
      'approved',
      'conditional_pass',
      'fail',
      'monitoring',
      'closed'
    ],
    riskStatuses: [
      'open',
      'in_progress',
      'pending_vendor',
      'pending_internal_review',
      'accepted',
      'closed',
      'overdue'
    ],
    reviewSequence: [
      { id: 'gtr_analyst_review', role: 'gtr_analyst', kind: 'primary' },
      { id: 'reviewer_review', role: 'reviewer', kind: 'secondary' },
      { id: 'privacy_review', role: 'privacy', kind: 'specialist', checklistId: CHECKLIST_IDS.PRIVACY },
      { id: 'legal_review', role: 'legal', kind: 'specialist', checklistId: CHECKLIST_IDS.LEGAL },
      { id: 'approval', role: 'approver', kind: 'decision', checklistId: CHECKLIST_IDS.APPROVER }
    ],
    casePolicies: {
      invitedVendorContactOnly: true,
      contractChangeReuseExistingCase: true,
      newContractRequiresNewCase: true
    }
  });

  const RATING_FRAMEWORK = Object.freeze({
    criticalityTiers: [
      { id: 'tier_1_critical', label: 'Tier 1 Critical' },
      { id: 'tier_2_important', label: 'Tier 2 Important' },
      { id: 'tier_3_low_risk', label: 'Tier 3 Low Risk' }
    ],
    criticalityBands: [
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' }
    ],
    decisionOutcomes: [
      { id: 'pass', label: 'Pass' },
      { id: 'conditional_pass', label: 'Conditional Pass' },
      { id: 'fail', label: 'Fail' }
    ],
    severityBands: [
      { id: 'low', label: 'Low' },
      { id: 'medium', label: 'Medium' },
      { id: 'high', label: 'High' },
      { id: 'critical', label: 'Critical' }
    ],
    criticalitySignals: [
      'data_protection',
      'privacy',
      'systems_access',
      'resilience',
      'legal_regulatory',
      'vendor_provenance',
      'upstream_supply_chain'
    ],
    periodicAssessmentSchedule: {
      high: 'annual_or_6_months_when_open_risks_exist',
      medium: 'every_3_years_or_on_material_change',
      low: 'on_demand'
    },
    riskControlCheckpoints: {
      tier_1_critical: {
        checkpoint: 'agreement_with_risk_statement_and_must_have_controls',
        label: 'High',
        action: 'Agreement to be drafted with details on the risk statement and must-have controls.'
      },
      tier_2_important: {
        checkpoint: 'exception_approval',
        label: 'Medium',
        action: 'Exception approval required.'
      },
      tier_3_low_risk: {
        checkpoint: 'autoapproved',
        label: 'Low Risk',
        action: 'Autoapproved.'
      }
    }
  });

  const VRM_INTAKE_TEMPLATE = Object.freeze({
    id: TEMPLATE_IDS.VRM_INTAKE,
    title: 'GTR Vendor Risk Management Intake',
    version: '1.0.0-poc',
    stage: 'stage_1_intake',
    fields: [
      { id: 'contractDescription', label: 'Contract description', type: 'long_text', required: false },
      { id: 'serviceScope', label: 'Service scope', type: 'long_text', required: true },
      { id: 'dataAccessRequired', label: 'Would the vendor need data access', type: 'boolean', required: true },
      { id: 'dataTypes', label: 'Access to data type', type: 'multi_select', required: false, options: ['pii', 'ip', 'finance_details', 'marketing_data', 'source_code', 'credentials', 'other'] },
      { id: 'headquartered', label: 'Headquartered', type: 'text', required: true },
      { id: 'subprocessors', label: 'Subprocessor details and locations', type: 'repeatable_entity_list', required: false },
      { id: 'hostingRegion', label: 'Hosting region', type: 'text', required: false },
      { id: 'businessUnit', label: 'Business unit', type: 'text', required: false }
    ],
    derivedOutputs: [
      'vendorDescription',
      'serviceType',
      'dataAccess',
      'regulatoryImpact',
      'technologyProvenance',
      'criticalityTier'
    ]
  });

  function buildCompositeQuestion(config) {
    return {
      evidencePolicy: 'none',
      helpText: '',
      required: true,
      ...config
    };
  }

  function buildYesNoOwnerPolicyQuestion(code, id, prompt) {
    return buildCompositeQuestion({
      id,
      code,
      prompt,
      responseType: 'yes_no_unknown_with_owner_and_policy_reference',
      evidencePolicy: 'policy_on_request',
      fields: [
        { id: 'status', label: 'Status', type: 'enum', options: QUESTION_STATUS_OPTIONS, required: true },
        { id: 'responsibleIndividual', label: 'Individual responsible', type: 'text', required: false },
        { id: 'policyReference', label: 'Company policy reference', type: 'text', required: false }
      ]
    });
  }

  function buildYesNoControlQuestion(code, id, prompt) {
    return buildCompositeQuestion({
      id,
      code,
      prompt,
      responseType: 'yes_no_unknown_with_control_detail_and_policy_reference',
      evidencePolicy: 'supporting_evidence_expected',
      fields: [
        { id: 'status', label: 'Status', type: 'enum', options: QUESTION_STATUS_OPTIONS, required: true },
        { id: 'implementationDetail', label: 'Product, service, standard, or comment', type: 'long_text', required: false },
        { id: 'policyReference', label: 'Corporate policy reference', type: 'text', required: false }
      ]
    });
  }

  const INFOSEC_READINESS_TEMPLATE = Object.freeze({
    id: TEMPLATE_IDS.INFOSEC_READINESS,
    title: 'GTR Vendor Information Security Readiness Assessment',
    version: '1.0.0-poc',
    questionnaireType: 'infosec_readiness',
    primaryLens: 'vendor_security',
    sourceArtifact: 'Group-Vendor_InfoSec_Assessments 1.xlsm',
    description: 'First native questionnaire seed based on the provided GTR Vendor InfoSec workbook. This is the first form to digitise for the PoC.',
    sections: [
      {
        id: 'about_vendor_and_arrangement',
        code: '1',
        title: 'About You And Your Proposed Arrangement With Us',
        questions: [
          buildCompositeQuestion({
            id: 'vendor_contact_name_and_role',
            code: '1.1.1',
            prompt: 'Please provide your name and function within your organisation.',
            responseType: 'short_text'
          }),
          buildCompositeQuestion({
            id: 'response_scope',
            code: '1.1.2',
            prompt: 'Please indicate the scope of your responses, for example your overall organisation, a specific division, business unit, or a specific business service.',
            responseType: 'long_text'
          }),
          buildCompositeQuestion({
            id: 'environment_name',
            code: '1.1.3',
            prompt: 'If applicable, please enter a unique name for this environment for use in our correspondence with you.',
            responseType: 'short_text',
            required: false
          }),
          buildCompositeQuestion({
            id: 'delivery_countries',
            code: '1.1.4',
            prompt: 'In which country or countries will operations to deliver this product or service be taking place?',
            responseType: 'country_list'
          }),
          buildCompositeQuestion({
            id: 'company_name_and_website',
            code: '1.1.5',
            prompt: 'Please provide your company name and official website address.',
            responseType: 'company_identity',
            fields: [
              { id: 'companyName', label: 'Company name', type: 'text', required: true },
              { id: 'website', label: 'Official website', type: 'url', required: false }
            ]
          }),
          buildCompositeQuestion({
            id: 'recent_or_current_contract',
            code: '1.1.6',
            prompt: 'Do you have a current or recent contract with us? If so, please provide details.',
            responseType: 'long_text',
            required: false
          })
        ]
      },
      {
        id: 'legal_and_regulatory_requirements',
        code: '2',
        title: 'Our Legal And Regulatory Requirements Of You',
        questions: [
          buildCompositeQuestion({
            id: 'regulatory_requirements_matrix',
            code: '2.1',
            prompt: 'Indicate whether you are currently compliant with the specified legal and regulatory requirements or will be compliant for this contract.',
            responseType: 'repeatable_compliance_matrix',
            evidencePolicy: 'supporting_evidence_expected',
            helpText: 'Examples may include PCI DSS, GDPR, ADGM, or ADHICS depending on the service and product in scope.',
            fields: REGULATORY_MATRIX_COLUMNS
          })
        ]
      },
      {
        id: 'information_security_governance',
        code: '3.1',
        title: 'Information Security Governance',
        questions: INFOSEC_GOVERNANCE_ITEMS.map(([code, id, prompt]) =>
          buildYesNoOwnerPolicyQuestion(code, id, prompt)
        )
      },
      {
        id: 'security_standards_frameworks_and_controls',
        code: '3.2',
        title: 'Security Standards, Frameworks, Policies And Controls',
        questions: [
          buildCompositeQuestion({
            id: 'recognised_security_standards',
            code: '3.2',
            prompt: 'Please indicate the information security standards that your organisation meets, including certification and audit detail where applicable.',
            responseType: 'repeatable_standard_matrix',
            evidencePolicy: 'supporting_evidence_expected',
            fields: STANDARD_MATRIX_COLUMNS
          }),
          ...INFOSEC_CONTROL_ITEMS.map(([code, id, prompt]) =>
            buildYesNoControlQuestion(code, id, prompt)
          )
        ]
      },
      {
        id: 'jurisdiction_and_operating_environment',
        code: '4',
        title: "Risks In The Vendor's Operating Environment",
        questions: [
          buildCompositeQuestion({
            id: 'different_legal_jurisdiction',
            code: '4.1',
            prompt: 'Will you or your key vendors or subcontractors operate under a different legal jurisdiction from our contract? If yes, identify the jurisdictions.',
            responseType: 'yes_no_unknown_with_jurisdictions_and_comment',
            evidencePolicy: 'optional',
            fields: [
              { id: 'status', label: 'Status', type: 'enum', options: QUESTION_STATUS_OPTIONS, required: true },
              { id: 'jurisdictions', label: 'Jurisdictions', type: 'country_list', required: false },
              { id: 'comment', label: 'Comment', type: 'long_text', required: false }
            ]
          }),
          buildCompositeQuestion({
            id: 'jurisdiction_secure_handling_impact',
            code: '4.2',
            prompt: 'Would that difference of jurisdiction have a significant impact on your safe, secure, and reliable handling of our shared information?',
            responseType: 'yes_no_unknown_with_comment',
            evidencePolicy: 'optional',
            fields: [
              { id: 'status', label: 'Status', type: 'enum', options: QUESTION_STATUS_OPTIONS, required: true },
              { id: 'comment', label: 'Nature and impact of the risk', type: 'long_text', required: false }
            ]
          }),
          buildCompositeQuestion({
            id: 'jurisdiction_liability_or_sanctions_risk',
            code: '4.3',
            prompt: 'Would there be any significant legislative or regulatory differences that could create criminal sanction or civil liability risk in the event of a loss?',
            responseType: 'yes_no_unknown_with_comment',
            evidencePolicy: 'optional',
            fields: [
              { id: 'status', label: 'Status', type: 'enum', options: QUESTION_STATUS_OPTIONS, required: true },
              { id: 'comment', label: 'Nature of the risk and mitigation', type: 'long_text', required: false }
            ]
          })
        ]
      }
    ]
  });

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function getQuestionCount(template) {
    return (Array.isArray(template?.sections) ? template.sections : [])
      .reduce((count, section) => count + (Array.isArray(section?.questions) ? section.questions.length : 0), 0);
  }

  function getEvidenceBearingQuestionCount(template) {
    return (Array.isArray(template?.sections) ? template.sections : [])
      .reduce((count, section) => count + (Array.isArray(section?.questions) ? section.questions.filter(question => {
        const policy = String(question?.evidencePolicy || 'none').trim().toLowerCase();
        return policy && policy !== 'none';
      }).length : 0), 0);
  }

  function getTemplateCatalog() {
    const template = INFOSEC_READINESS_TEMPLATE;
    return [{
      id: template.id,
      title: template.title,
      version: template.version,
      questionnaireType: template.questionnaireType,
      sectionCount: template.sections.length,
      questionCount: getQuestionCount(template),
      evidenceBearingQuestionCount: getEvidenceBearingQuestionCount(template)
    }];
  }

  function getIntakeTemplate() {
    return deepClone(VRM_INTAKE_TEMPLATE);
  }

  function getQuestionnaireTemplate(templateId = TEMPLATE_IDS.INFOSEC_READINESS) {
    if (String(templateId || '').trim() !== TEMPLATE_IDS.INFOSEC_READINESS) return null;
    return deepClone(INFOSEC_READINESS_TEMPLATE);
  }

  function summariseQuestionnaireTemplate(templateId = TEMPLATE_IDS.INFOSEC_READINESS) {
    const template = getQuestionnaireTemplate(templateId);
    if (!template) return null;
    return {
      id: template.id,
      title: template.title,
      sectionCount: template.sections.length,
      questionCount: getQuestionCount(template),
      evidenceBearingQuestionCount: getEvidenceBearingQuestionCount(template)
    };
  }

  function listReviewChecklistTemplates() {
    return Object.values(REVIEW_CHECKLIST_TEMPLATES).map(template => ({
      id: template.id,
      role: template.role,
      title: template.title,
      itemCount: template.items.length
    }));
  }

  function getReviewChecklistTemplate(roleOrTemplateId = '') {
    const safeValue = String(roleOrTemplateId || '').trim().toLowerCase();
    const match = Object.values(REVIEW_CHECKLIST_TEMPLATES).find(template =>
      template.id.toLowerCase() === safeValue || template.role.toLowerCase() === safeValue
    );
    return match ? deepClone(match) : null;
  }

  function getWorkflowModel() {
    return deepClone(WORKFLOW_MODEL);
  }

  function getRatingFramework() {
    return deepClone(RATING_FRAMEWORK);
  }

  function listServiceTypeProfiles() {
    return Object.values(SERVICE_TYPE_PROFILES).map(profile => ({
      id: profile.id,
      label: profile.label,
      deepDiveTopics: profile.deepDiveTopics.slice()
    }));
  }

  function listContractClausePacks() {
    return Object.values(CONTRACT_CLAUSE_PACKS).map((pack) => ({
      id: pack.id,
      title: pack.title,
      appliesTo: pack.appliesTo.slice(),
      clauseCount: pack.clauses.length
    }));
  }

  function inferServiceType({ serviceScope = '', contractDescription = '' } = {}) {
    const haystack = `${String(serviceScope || '')} ${String(contractDescription || '')}`.trim().toLowerCase();
    if (!haystack) return 'technology_provider';
    if (/\b(ai|llm|machine learning|model|genai|artificial intelligence)\b/.test(haystack)) return 'ai';
    if (/\b(saas|software as a service|cloud platform|hosted application|hosted service)\b/.test(haystack)) return 'saas';
    if (/\b(consulting|consultant|advisory|professional services|implementation partner)\b/.test(haystack)) return 'consulting';
    if (/\b(hardware|device|equipment|appliance|firmware|iot)\b/.test(haystack)) return 'hardware';
    return 'technology_provider';
  }

  function normaliseList(value) {
    if (Array.isArray(value)) {
      return value
        .map(item => String(item || '').trim())
        .filter(Boolean);
    }
    return String(value || '')
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);
  }

  function normaliseBoolean(value) {
    if (value === true || value === false) return value;
    const safeValue = String(value || '').trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(safeValue)) return true;
    if (['false', 'no', 'n', '0'].includes(safeValue)) return false;
    return false;
  }

  function getRiskControlCheckpoint(criticalityTier = '') {
    const safeTier = String(criticalityTier || '').trim().toLowerCase();
    return deepClone(RATING_FRAMEWORK.riskControlCheckpoints[safeTier] || null);
  }

  function buildIntakeOutputFrame(intake = {}) {
    const serviceType = inferServiceType(intake);
    const dataTypes = normaliseList(intake.dataTypes).map(value => value.toLowerCase());
    const subprocessors = Array.isArray(intake?.subprocessors) ? intake.subprocessors.map(item => ({
      name: String(item?.name || '').trim(),
      location: String(item?.location || '').trim()
    })) : [];
    const hasDataAccess = normaliseBoolean(intake.dataAccessRequired);
    const regulatoryImpact = [];

    if (hasDataAccess && dataTypes.some(value => value.includes('pii') || value.includes('personal'))) {
      regulatoryImpact.push('privacy');
    }
    if (hasDataAccess && dataTypes.some(value => value.includes('finance'))) {
      regulatoryImpact.push('financial');
    }
    if (serviceType === 'ai') {
      regulatoryImpact.push('ai_governance');
    }
    if (String(intake.hostingRegion || '').trim() || subprocessors.some(item => item.location)) {
      regulatoryImpact.push('cross_border_and_residency');
    }

    return {
      vendorDescription: String(intake.contractDescription || intake.serviceScope || '').trim(),
      serviceType,
      serviceProfile: deepClone(SERVICE_TYPE_PROFILES[serviceType]),
      dataAccess: {
        required: hasDataAccess,
        dataTypes
      },
      regulatoryImpact: Array.from(new Set(regulatoryImpact)),
      technologyProvenance: {
        headquartered: String(intake.headquartered || '').trim(),
        hostingRegion: String(intake.hostingRegion || '').trim(),
        subprocessors
      },
      criticalityTier: 'pending_scoring',
      scoringInputs: {
        stage1: {
          dataCriticality: dataTypes,
          hostingRegion: String(intake.hostingRegion || '').trim(),
          subprocessors
        },
        stage2: 'findings_from_stage_2',
        stage3: 'response_to_stage_3',
        stage4: 'evidence_review_from_stage_4'
      }
    };
  }

  function buildClauseRecommendationFrame(intake = {}) {
    const intakeOutput = buildIntakeOutputFrame(intake);
    const serviceType = String(intakeOutput.serviceType || '').trim().toLowerCase();
    const recommendedPacks = ['baseline_security'];

    if (['saas'].includes(serviceType)) recommendedPacks.push('saas_hosting');
    if (['ai'].includes(serviceType)) recommendedPacks.push('ai_usage');
    if (['consulting'].includes(serviceType)) recommendedPacks.push('consulting_delivery');
    if (['technology_provider', 'hardware'].includes(serviceType)) recommendedPacks.push('technology_and_endpoint');
    if (
      String(intakeOutput.technologyProvenance.hostingRegion || '').trim()
      || intakeOutput.technologyProvenance.subprocessors.some(item => item.location || item.name)
      || intakeOutput.regulatoryImpact.includes('cross_border_and_residency')
    ) {
      recommendedPacks.push('data_transfer_and_subprocessors');
    }

    const uniquePackIds = Array.from(new Set(recommendedPacks));
    const recommendedClausePacks = uniquePackIds
      .map((packId) => CONTRACT_CLAUSE_PACKS[packId])
      .filter(Boolean)
      .map((pack) => deepClone(pack));

    return {
      serviceType,
      packIds: uniquePackIds,
      recommendedClausePacks,
      tailoringFactors: {
        regulatoryImpact: intakeOutput.regulatoryImpact.slice(),
        hasDataAccess: intakeOutput.dataAccess.required,
        dataTypes: intakeOutput.dataAccess.dataTypes.slice(),
        headquartered: intakeOutput.technologyProvenance.headquartered,
        hostingRegion: intakeOutput.technologyProvenance.hostingRegion,
        subprocessorCount: intakeOutput.technologyProvenance.subprocessors.length
      },
      legalReviewGuidance: [
        'Clause wording should vary by service and product nature, not be treated as one static schedule.',
        'Hosting, AI, data-transfer, subprocessor, and resilience clauses should be switched on only when the operating model supports them.',
        'Final contract language should remain subject to legal review even when the platform recommends clause packs.'
      ]
    };
  }

  function getAssessmentPolicy(caseType = 'new_contract') {
    const safeCaseType = CASE_TYPES.includes(caseType) ? caseType : 'new_contract';
    return {
      caseType: safeCaseType,
      reuseExistingCase: safeCaseType === 'contract_change',
      requiresNewCase: safeCaseType === 'new_contract',
      invitedVendorContactOnly: true
    };
  }

  function buildDefaultCaseRecord({
    caseId = '',
    caseType = 'new_contract',
    vendorName = '',
    invitedVendorContactEmail = ''
  } = {}) {
    const assessmentPolicy = getAssessmentPolicy(caseType);
    return {
      id: String(caseId || '').trim(),
      vendorName: String(vendorName || '').trim(),
      caseType: assessmentPolicy.caseType,
      status: 'intake',
      cycleType: assessmentPolicy.caseType === 'contract_change'
        ? 'change_request'
        : assessmentPolicy.caseType === 'periodic_reassessment'
          ? 'periodic'
          : assessmentPolicy.caseType === 'exception_handling'
            ? 'exception'
            : 'initial',
      questionnaireTemplateId: TEMPLATE_IDS.INFOSEC_READINESS,
      rating: {
        criticality: 'unrated',
        decisionOutcome: 'pending'
      },
      vendorAccess: {
        invitedContactOnly: assessmentPolicy.invitedVendorContactOnly,
        invitedVendorContactEmail: String(invitedVendorContactEmail || '').trim().toLowerCase()
      },
      jira: {
        syncState: 'not_configured',
        issueKeys: []
      }
    };
  }

  const api = {
    TEMPLATE_IDS,
    CHECKLIST_IDS,
    CASE_TYPES,
    CYCLE_TYPES,
    getTemplateCatalog,
    getIntakeTemplate,
    getQuestionnaireTemplate,
    summariseQuestionnaireTemplate,
    listReviewChecklistTemplates,
    getReviewChecklistTemplate,
    getWorkflowModel,
    getRatingFramework,
    listServiceTypeProfiles,
    listContractClausePacks,
    inferServiceType,
    getRiskControlCheckpoint,
    buildIntakeOutputFrame,
    buildClauseRecommendationFrame,
    getAssessmentPolicy,
    buildDefaultCaseRecord
  };

  globalScope.VendorRiskTemplateService = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
