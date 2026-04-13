(function(globalScope) {
  'use strict';

  const STORAGE_KEY = 'vrm_vendor_cases_v1';
  const templateService = globalScope.VendorRiskTemplateService
    || (typeof require === 'function' ? require('./vendorRiskTemplateService') : null);
  const accessService = globalScope.PortalAccessService
    || (typeof require === 'function' ? require('./portalAccessService') : null);
  let memoryStore = [];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function readRawStore() {
    try {
      if (typeof localStorage === 'undefined') return clone(memoryStore);
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(stored) && stored.length) return stored;
    } catch {}
    return [];
  }

  function writeRawStore(cases) {
    const nextCases = Array.isArray(cases) ? clone(cases) : [];
    memoryStore = nextCases;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextCases));
      }
    } catch {}
    return nextCases;
  }

  function buildSeedTimeline(entries = []) {
    return entries.map((entry, index) => ({
      id: String(entry.id || `timeline-${index + 1}`),
      type: String(entry.type || 'note'),
      actor: String(entry.actor || '').trim(),
      actorRole: String(entry.actorRole || '').trim(),
      message: String(entry.message || '').trim(),
      at: String(entry.at || nowIso())
    }));
  }

  function normaliseEvidenceFile(file = {}) {
    const uploadedAt = String(file.uploadedAt || nowIso());
    const safeName = String(file.name || 'Untitled file').trim();
    return {
      id: String(file.id || `evidence-${safeName.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'file'}-${uploadedAt}`),
      name: safeName,
      sizeBytes: Math.max(0, Number(file.sizeBytes || file.size || 0)),
      type: String(file.type || 'application/octet-stream').trim(),
      uploadedAt,
      uploadedBy: String(file.uploadedBy || '').trim(),
      source: String(file.source || 'vendor_upload').trim()
    };
  }

  function normaliseQuestionnaireResponses(responses = {}) {
    return Object.keys(responses || {}).reduce((accumulator, key) => {
      const safeKey = String(key || '').trim();
      if (!safeKey) return accumulator;
      accumulator[safeKey] = String(responses[key] || '').trim();
      return accumulator;
    }, {});
  }

  function normaliseClarificationItem(item = {}, index = 0) {
    return {
      id: String(item.id || `clarification-${index + 1}`),
      direction: String(item.direction || 'internal_request').trim(),
      message: String(item.message || '').trim(),
      actor: String(item.actor || '').trim(),
      actorRole: String(item.actorRole || '').trim(),
      at: String(item.at || nowIso())
    };
  }

  function buildSeedCase({
    id,
    vendorName,
    caseType = 'new_contract',
    status = 'intake',
    title = '',
    serviceScope = '',
    contractDescription = '',
    dataAccessRequired = false,
    dataTypes = [],
    headquartered = '',
    subprocessors = [],
    hostingRegion = '',
    businessUnit = '',
    assignedVendorUsername = '',
    invitedVendorContactEmail = '',
    rating = {},
    decision = {},
    vendor = {},
    internal = {},
    schedule = {},
    activity = []
  }) {
    const intake = {
      serviceScope,
      contractDescription,
      dataAccessRequired,
      dataTypes,
      headquartered,
      subprocessors,
      hostingRegion,
      businessUnit
    };
    const serviceType = templateService?.inferServiceType?.(intake) || 'technology_provider';
    const intakeOutput = templateService?.buildIntakeOutputFrame?.(intake) || {};
    const clauseFrame = templateService?.buildClauseRecommendationFrame?.(intake) || { recommendedPacks: [], considerations: [], reviewNotes: [] };
    const ratingFramework = templateService?.getRatingFramework?.() || {};
    const criticality = String(rating.criticality || 'pending').trim();
    const checkpoint = templateService?.getRiskControlCheckpoint?.(criticality) || null;
    const caseRecord = templateService?.buildDefaultCaseRecord?.({
      caseId: id,
      caseType,
      vendorName,
      invitedVendorContactEmail
    }) || {
      id,
      vendorName,
      caseType,
      status,
      rating: { criticality: 'unrated', decisionOutcome: 'pending' },
      vendorAccess: { invitedContactOnly: true, invitedVendorContactEmail }
    };
    return normaliseCaseRecord({
      ...caseRecord,
      title: String(title || `${vendorName} assessment`).trim(),
      status,
      serviceType,
      serviceScope,
      contractDescription,
      businessUnit,
      intake,
      intakeOutput,
      clauseFrame,
      assignedVendorUsername,
      rating: {
        criticality: criticality || 'pending',
        likelihood: String(rating.likelihood || 'Medium').trim(),
        impact: String(rating.impact || 'Medium').trim(),
        decisionOutcome: String(rating.decisionOutcome || 'pending').trim(),
        regulatoryImpact: Array.isArray(intakeOutput.regulatoryImpact) ? intakeOutput.regulatoryImpact.slice() : []
      },
      decision: {
        outcome: String(decision.outcome || rating.decisionOutcome || 'pending').trim(),
        checkpoint,
        summaryStatement: String(decision.summaryStatement || '').trim(),
        riskStatement: String(decision.riskStatement || '').trim(),
        mitigation: String(decision.mitigation || '').trim()
      },
      questionnaire: {
        templateId: caseRecord.questionnaireTemplateId || (templateService?.TEMPLATE_IDS?.INFOSEC_READINESS || 'gtr_vendor_infosec_readiness_v1'),
        status: String(vendor.questionnaireStatus || 'not_started').trim(),
        responses: normaliseQuestionnaireResponses(vendor.questionnaireResponses || {}),
        lastSubmittedAt: String(vendor.lastSubmittedAt || '').trim()
      },
      vendor: {
        invitedVendorContactEmail,
        assignedVendorUsername,
        evidenceFiles: Array.isArray(vendor.evidenceFiles) ? vendor.evidenceFiles.map(normaliseEvidenceFile) : [],
        clarificationHistory: Array.isArray(vendor.clarificationHistory)
          ? vendor.clarificationHistory.map(normaliseClarificationItem)
          : [],
        latestMessage: String(vendor.latestMessage || '').trim()
      },
      internal: {
        findings: Array.isArray(internal.findings) ? internal.findings.map((finding, index) => ({
          id: String(finding.id || `finding-${index + 1}`),
          severity: String(finding.severity || 'medium').trim(),
          title: String(finding.title || 'Untitled finding').trim(),
          detail: String(finding.detail || '').trim(),
          mitigation: String(finding.mitigation || '').trim()
        })) : [],
        controlRecommendations: Array.isArray(internal.controlRecommendations)
          ? internal.controlRecommendations.map(item => String(item || '').trim()).filter(Boolean)
          : [],
        reviewChecklistStatus: clone(internal.reviewChecklistStatus || {}),
        aiAnalysis: internal.aiAnalysis ? clone(internal.aiAnalysis) : null
      },
      schedule: {
        dueDate: String(schedule.dueDate || '').trim(),
        reassessmentDate: String(schedule.reassessmentDate || '').trim(),
        lastActivityAt: String(schedule.lastActivityAt || nowIso())
      },
      activity: buildSeedTimeline(activity),
      meta: {
        availableCriticalityTiers: Array.isArray(ratingFramework.criticalityTiers) ? ratingFramework.criticalityTiers.slice() : [],
        availableDecisionOutcomes: Array.isArray(ratingFramework.decisionOutcomes) ? ratingFramework.decisionOutcomes.slice() : []
      }
    });
  }

  function normaliseCaseRecord(caseRecord = {}) {
    const safeId = String(caseRecord.id || '').trim() || `VRM-${Date.now()}`;
    const lastActivityAt = String(caseRecord?.schedule?.lastActivityAt || caseRecord.lastActivityAt || nowIso());
    return {
      id: safeId,
      title: String(caseRecord.title || `${caseRecord.vendorName || 'Vendor'} assessment`).trim(),
      vendorName: String(caseRecord.vendorName || '').trim(),
      caseType: String(caseRecord.caseType || 'new_contract').trim(),
      cycleType: String(caseRecord.cycleType || 'initial').trim(),
      status: String(caseRecord.status || 'intake').trim(),
      serviceType: String(caseRecord.serviceType || '').trim(),
      serviceScope: String(caseRecord.serviceScope || '').trim(),
      contractDescription: String(caseRecord.contractDescription || '').trim(),
      businessUnit: String(caseRecord.businessUnit || caseRecord?.intake?.businessUnit || '').trim(),
      intake: clone(caseRecord.intake || {}),
      intakeOutput: clone(caseRecord.intakeOutput || {}),
      clauseFrame: clone(caseRecord.clauseFrame || { recommendedPacks: [], considerations: [], reviewNotes: [] }),
      assignedVendorUsername: String(caseRecord.assignedVendorUsername || caseRecord?.vendor?.assignedVendorUsername || '').trim().toLowerCase(),
      rating: {
        criticality: String(caseRecord?.rating?.criticality || 'pending').trim(),
        likelihood: String(caseRecord?.rating?.likelihood || 'Medium').trim(),
        impact: String(caseRecord?.rating?.impact || 'Medium').trim(),
        decisionOutcome: String(caseRecord?.rating?.decisionOutcome || 'pending').trim(),
        regulatoryImpact: Array.isArray(caseRecord?.rating?.regulatoryImpact) ? caseRecord.rating.regulatoryImpact.slice() : []
      },
      decision: {
        outcome: String(caseRecord?.decision?.outcome || 'pending').trim(),
        checkpoint: caseRecord?.decision?.checkpoint ? clone(caseRecord.decision.checkpoint) : null,
        summaryStatement: String(caseRecord?.decision?.summaryStatement || '').trim(),
        riskStatement: String(caseRecord?.decision?.riskStatement || '').trim(),
        mitigation: String(caseRecord?.decision?.mitigation || '').trim()
      },
      questionnaire: {
        templateId: String(caseRecord?.questionnaire?.templateId || '').trim(),
        status: String(caseRecord?.questionnaire?.status || 'not_started').trim(),
        responses: normaliseQuestionnaireResponses(caseRecord?.questionnaire?.responses || {}),
        lastSubmittedAt: String(caseRecord?.questionnaire?.lastSubmittedAt || '').trim()
      },
      vendor: {
        invitedVendorContactEmail: String(caseRecord?.vendor?.invitedVendorContactEmail || caseRecord?.vendorAccess?.invitedVendorContactEmail || '').trim().toLowerCase(),
        assignedVendorUsername: String(caseRecord?.vendor?.assignedVendorUsername || caseRecord.assignedVendorUsername || '').trim().toLowerCase(),
        evidenceFiles: Array.isArray(caseRecord?.vendor?.evidenceFiles) ? caseRecord.vendor.evidenceFiles.map(normaliseEvidenceFile) : [],
        clarificationHistory: Array.isArray(caseRecord?.vendor?.clarificationHistory)
          ? caseRecord.vendor.clarificationHistory.map(normaliseClarificationItem)
          : [],
        latestMessage: String(caseRecord?.vendor?.latestMessage || '').trim()
      },
      internal: {
        findings: Array.isArray(caseRecord?.internal?.findings) ? caseRecord.internal.findings.map(item => clone(item)) : [],
        controlRecommendations: Array.isArray(caseRecord?.internal?.controlRecommendations) ? caseRecord.internal.controlRecommendations.slice() : [],
        reviewChecklistStatus: clone(caseRecord?.internal?.reviewChecklistStatus || {}),
        aiAnalysis: caseRecord?.internal?.aiAnalysis ? clone(caseRecord.internal.aiAnalysis) : null
      },
      schedule: {
        dueDate: String(caseRecord?.schedule?.dueDate || '').trim(),
        reassessmentDate: String(caseRecord?.schedule?.reassessmentDate || '').trim(),
        lastActivityAt
      },
      activity: buildSeedTimeline(caseRecord.activity || []),
      meta: clone(caseRecord.meta || {})
    };
  }

  function buildSeedCases() {
    return [
      buildSeedCase({
        id: 'VRM-2026-001',
        vendorName: 'Aster Cloud',
        title: 'Aster Cloud supplier collaboration platform',
        status: 'awaiting_vendor_clarification',
        serviceScope: 'Hosted SaaS platform for supplier collaboration, contract workflows, and spend analytics.',
        contractDescription: 'New SaaS platform supporting supplier onboarding and vendor performance reporting.',
        dataAccessRequired: true,
        dataTypes: ['PII', 'Finance details'],
        headquartered: 'United Arab Emirates',
        subprocessors: [
          { name: 'NorthBridge Hosting', location: 'Germany' },
          { name: 'Telemetry Ops', location: 'India' }
        ],
        hostingRegion: 'Germany',
        businessUnit: 'Group Procurement',
        assignedVendorUsername: 'vendor.demo',
        invitedVendorContactEmail: 'security@astercloud.example',
        rating: {
          criticality: 'tier_2_important',
          likelihood: 'Medium',
          impact: 'High',
          decisionOutcome: 'conditional_pass'
        },
        decision: {
          outcome: 'conditional_pass',
          summaryStatement: 'Aster Cloud supports a material supplier-management workflow with personal and financial data in scope, so it requires a conditional approval posture until hosting transparency and incident-notification commitments are tightened.',
          riskStatement: 'Cross-border hosting and subprocessor visibility create a moderate likelihood of delayed issue detection and a high business impact if supplier or financial workflows are disrupted.',
          mitigation: 'Require tighter subprocessor change control, log retention commitments, and stronger incident notification wording before approval.'
        },
        vendor: {
          questionnaireStatus: 'submitted',
          questionnaireResponses: {
            security_program: 'ISO 27001-certified security program with quarterly policy review.',
            encryption_at_rest: 'AES-256 for production storage and backups.',
            access_management: 'SSO for workforce access and MFA enforced for privileged roles.',
            incident_notification: 'Material security incidents are communicated within 48 hours.'
          },
          lastSubmittedAt: '2026-04-08T09:45:00.000Z',
          evidenceFiles: [
            { name: 'SOC2-Type2-2025.pdf', sizeBytes: 4200000, type: 'application/pdf', uploadedBy: 'security@astercloud.example', uploadedAt: '2026-04-08T09:46:00.000Z' },
            { name: 'ISO27001-Certificate.pdf', sizeBytes: 840000, type: 'application/pdf', uploadedBy: 'security@astercloud.example', uploadedAt: '2026-04-08T09:47:00.000Z' }
          ],
          clarificationHistory: [
            {
              direction: 'internal_request',
              actor: 'Lina GTR',
              actorRole: 'gtr_analyst',
              at: '2026-04-09T11:00:00.000Z',
              message: 'Please confirm the production log-retention period and whether subprocessor changes require customer notification.'
            }
          ],
          latestMessage: 'Waiting for updated log-retention and subprocessor notification details.'
        },
        internal: {
          findings: [
            {
              severity: 'medium',
              title: 'Subprocessor change control needs tightening',
              detail: 'The current response names subprocessors but does not confirm prior notice or approval thresholds.',
              mitigation: 'Add contract clauses for notice and approval on material subprocessor changes.'
            },
            {
              severity: 'medium',
              title: 'Incident reporting timeline may be too slow',
              detail: 'A 48-hour default window may not be acceptable for critical supplier workflow disruption.',
              mitigation: 'Move to a faster notification trigger for high-severity incidents.'
            }
          ],
          controlRecommendations: [
            'Switch on SaaS hosting and data-transfer clause packs.',
            'Require evidence of centralized monitoring and longer log retention.'
          ]
        },
        schedule: {
          dueDate: '2026-04-18',
          reassessmentDate: '2027-04-18',
          lastActivityAt: '2026-04-09T11:00:00.000Z'
        },
        activity: [
          { type: 'case_created', actor: 'Lina GTR', actorRole: 'gtr_analyst', at: '2026-04-07T08:30:00.000Z', message: 'Case opened and vendor invited.' },
          { type: 'vendor_submission', actor: 'security@astercloud.example', actorRole: 'vendor_contact', at: '2026-04-08T09:45:00.000Z', message: 'Questionnaire and evidence submitted.' },
          { type: 'clarification_requested', actor: 'Lina GTR', actorRole: 'gtr_analyst', at: '2026-04-09T11:00:00.000Z', message: 'Clarification requested on logging and subprocessors.' }
        ]
      }),
      buildSeedCase({
        id: 'VRM-2026-002',
        vendorName: 'Northstar AI',
        title: 'Northstar AI model operations tooling',
        status: 'vendor_in_progress',
        serviceScope: 'AI platform used for model monitoring, prompt governance, and incident analysis support.',
        contractDescription: 'AI service supporting model operations and prompt tracing for internal engineering teams.',
        dataAccessRequired: true,
        dataTypes: ['IP', 'PII'],
        headquartered: 'United Kingdom',
        subprocessors: [
          { name: 'Prompt Infra Ltd', location: 'Ireland' }
        ],
        hostingRegion: 'Ireland',
        businessUnit: 'Digital Platforms',
        assignedVendorUsername: 'vendor.ai',
        invitedVendorContactEmail: 'trust@northstar-ai.example',
        rating: {
          criticality: 'tier_1_critical',
          likelihood: 'High',
          impact: 'High',
          decisionOutcome: 'pending'
        },
        decision: {
          outcome: 'pending',
          summaryStatement: 'Northstar AI is still in the vendor response stage. The service has a potentially high control burden because AI governance, customer data handling, and production monitoring are all in scope.',
          riskStatement: 'An AI vendor operating on sensitive prompts and model telemetry could create a high-impact control gap if governance and residency controls are weak.',
          mitigation: 'Complete AI governance questionnaire, verify hosting and residency controls, and confirm model and prompt retention policies.'
        },
        vendor: {
          questionnaireStatus: 'draft',
          questionnaireResponses: {
            ai_governance: 'A draft AI governance policy is available and under executive review.',
            data_residency: 'Primary hosting in Ireland with no UAE region today.'
          },
          evidenceFiles: [
            { name: 'AI-Governance-Policy-Draft.pdf', sizeBytes: 1900000, type: 'application/pdf', uploadedBy: 'trust@northstar-ai.example', uploadedAt: '2026-04-10T12:10:00.000Z' }
          ],
          clarificationHistory: [],
          latestMessage: 'Vendor has started the questionnaire but has not submitted the final pack.'
        },
        internal: {
          findings: [],
          controlRecommendations: [
            'Apply baseline security, AI usage, and data-transfer clause packs.'
          ]
        },
        schedule: {
          dueDate: '2026-04-22',
          reassessmentDate: '2027-04-22',
          lastActivityAt: '2026-04-10T12:10:00.000Z'
        },
        activity: [
          { type: 'case_created', actor: 'Noor GTR', actorRole: 'gtr_analyst', at: '2026-04-10T08:00:00.000Z', message: 'Case opened for new AI vendor onboarding.' },
          { type: 'vendor_draft_saved', actor: 'trust@northstar-ai.example', actorRole: 'vendor_contact', at: '2026-04-10T12:10:00.000Z', message: 'Vendor saved the first questionnaire draft.' }
        ]
      }),
      buildSeedCase({
        id: 'VRM-2025-014',
        vendorName: 'Helix Advisory',
        title: 'Helix Advisory annual reassessment',
        caseType: 'periodic_reassessment',
        status: 'internal_review',
        serviceScope: 'Consulting engagement for transformation and architecture advisory.',
        contractDescription: 'Periodic reassessment for consulting provider with access to non-G42-managed endpoints.',
        dataAccessRequired: false,
        dataTypes: [],
        headquartered: 'India',
        subprocessors: [],
        hostingRegion: '',
        businessUnit: 'Enterprise Transformation',
        assignedVendorUsername: 'vendor.helix',
        invitedVendorContactEmail: 'controls@helixadvisory.example',
        rating: {
          criticality: 'tier_3_low_risk',
          likelihood: 'Low',
          impact: 'Medium',
          decisionOutcome: 'pass'
        },
        decision: {
          outcome: 'pass',
          summaryStatement: 'Helix Advisory remains in a low-risk consulting posture, but the reassessment confirms that endpoint and training attestations should be refreshed annually.',
          riskStatement: 'Residual exposure is limited to consultant-device hygiene and access lifecycle discipline.',
          mitigation: 'Track annual endpoint attestation and NDA refresh as open items.'
        },
        vendor: {
          questionnaireStatus: 'submitted',
          questionnaireResponses: {
            nda_controls: 'All consultants sign the current NDA pack before project access.',
            endpoint_security: 'Company-managed EDR on all advisory laptops used for client work.',
            security_training: 'Annual secure-handling training is mandatory.'
          },
          lastSubmittedAt: '2026-03-30T14:20:00.000Z',
          evidenceFiles: [
            { name: 'Consultant-Endpoint-Attestation.pdf', sizeBytes: 620000, type: 'application/pdf', uploadedBy: 'controls@helixadvisory.example', uploadedAt: '2026-03-30T14:25:00.000Z' }
          ],
          clarificationHistory: [],
          latestMessage: 'Reassessment packet submitted and ready for internal review.'
        },
        internal: {
          findings: [
            {
              severity: 'low',
              title: 'Annual endpoint attestation needs tracking',
              detail: 'Attestation is present for the current cycle but needs a dated renewal reminder.',
              mitigation: 'Track a reassessment task for next-year device attestation.'
            }
          ],
          controlRecommendations: [
            'Retain consulting-delivery clause pack and annual attestation reminder.'
          ]
        },
        schedule: {
          dueDate: '2026-04-16',
          reassessmentDate: '2027-03-30',
          lastActivityAt: '2026-03-30T14:25:00.000Z'
        },
        activity: [
          { type: 'reassessment_opened', actor: 'Maya GTR', actorRole: 'gtr_analyst', at: '2026-03-24T09:00:00.000Z', message: 'Annual reassessment cycle opened.' },
          { type: 'vendor_submission', actor: 'controls@helixadvisory.example', actorRole: 'vendor_contact', at: '2026-03-30T14:20:00.000Z', message: 'Reassessment response submitted.' }
        ]
      })
    ];
  }

  function ensureCases() {
    const existing = readRawStore();
    if (Array.isArray(existing) && existing.length) {
      const normalised = existing.map(normaliseCaseRecord);
      writeRawStore(normalised);
      return normalised;
    }
    const seeded = buildSeedCases();
    writeRawStore(seeded);
    return seeded;
  }

  function getAllCases() {
    return ensureCases().map(normaliseCaseRecord);
  }

  function getCaseById(caseId = '') {
    const safeCaseId = String(caseId || '').trim();
    if (!safeCaseId) return null;
    const match = ensureCases().find(caseRecord => caseRecord.id === safeCaseId);
    return match ? normaliseCaseRecord(match) : null;
  }

  function getCasesForUser(user = null) {
    const currentUser = user || (typeof globalScope.AuthService !== 'undefined' ? globalScope.AuthService.getCurrentUser() : null);
    const allCases = getAllCases();
    if (!currentUser) return [];
    const portalKind = accessService?.getPortalKindForRole?.(currentUser.role) || 'guest';
    if (portalKind === 'admin' || portalKind === 'internal') return allCases;
    if (portalKind === 'vendor') {
      const safeUsername = String(currentUser.username || '').trim().toLowerCase();
      return allCases.filter(caseRecord => String(caseRecord.assignedVendorUsername || '').trim().toLowerCase() === safeUsername);
    }
    return [];
  }

  function getPrimaryCaseForUser(user = null) {
    return getCasesForUser(user)[0] || null;
  }

  function updateCase(caseId, updater) {
    const safeCaseId = String(caseId || '').trim();
    if (!safeCaseId || typeof updater !== 'function') return null;
    const cases = ensureCases();
    let updatedCase = null;
    const nextCases = cases.map((caseRecord) => {
      if (caseRecord.id !== safeCaseId) return caseRecord;
      updatedCase = normaliseCaseRecord(updater(normaliseCaseRecord(caseRecord)) || caseRecord);
      return updatedCase;
    });
    if (!updatedCase) return null;
    writeRawStore(nextCases);
    return updatedCase;
  }

  function appendTimelineEntry(caseRecord, entry = {}) {
    const nextEntry = {
      id: String(entry.id || `timeline-${caseRecord.activity.length + 1}`),
      type: String(entry.type || 'note').trim(),
      actor: String(entry.actor || '').trim(),
      actorRole: String(entry.actorRole || '').trim(),
      message: String(entry.message || '').trim(),
      at: String(entry.at || nowIso())
    };
    return {
      ...caseRecord,
      activity: [...caseRecord.activity, nextEntry],
      schedule: {
        ...caseRecord.schedule,
        lastActivityAt: nextEntry.at
      }
    };
  }

  function saveVendorQuestionnaire(caseId, responses = {}, { submitted = false, actorUsername = '' } = {}) {
    return updateCase(caseId, (caseRecord) => {
      const nextResponses = {
        ...caseRecord.questionnaire.responses,
        ...normaliseQuestionnaireResponses(responses)
      };
      const submittedAt = submitted ? nowIso() : caseRecord.questionnaire.lastSubmittedAt;
      const nextStatus = submitted ? 'internal_review' : 'vendor_in_progress';
      const nextCase = appendTimelineEntry({
        ...caseRecord,
        status: nextStatus,
        questionnaire: {
          ...caseRecord.questionnaire,
          status: submitted ? 'submitted' : 'draft',
          responses: nextResponses,
          lastSubmittedAt: submittedAt
        },
        vendor: {
          ...caseRecord.vendor,
          latestMessage: submitted
            ? 'Vendor submitted the questionnaire for internal review.'
            : 'Vendor saved a questionnaire draft.'
        }
      }, {
        type: submitted ? 'vendor_submission' : 'vendor_draft_saved',
        actor: actorUsername,
        actorRole: 'vendor_contact',
        message: submitted
          ? 'Vendor submitted the questionnaire.'
          : 'Vendor saved questionnaire progress.'
      });
      return nextCase;
    });
  }

  function addEvidenceFiles(caseId, files = [], { actorUsername = '' } = {}) {
    const nextFiles = Array.isArray(files) ? files.map(normaliseEvidenceFile) : [];
    if (!nextFiles.length) return getCaseById(caseId);
    return updateCase(caseId, (caseRecord) => appendTimelineEntry({
      ...caseRecord,
      vendor: {
        ...caseRecord.vendor,
        evidenceFiles: [...caseRecord.vendor.evidenceFiles, ...nextFiles],
        latestMessage: `${nextFiles.length} evidence file${nextFiles.length === 1 ? '' : 's'} uploaded.`
      }
    }, {
      type: 'evidence_uploaded',
      actor: actorUsername,
      actorRole: 'vendor_contact',
      message: `${nextFiles.length} evidence file${nextFiles.length === 1 ? '' : 's'} uploaded.`
    }));
  }

  function addVendorClarificationResponse(caseId, message = '', { actorUsername = '' } = {}) {
    const safeMessage = String(message || '').trim();
    if (!safeMessage) return getCaseById(caseId);
    return updateCase(caseId, (caseRecord) => appendTimelineEntry({
      ...caseRecord,
      status: 'internal_review',
      vendor: {
        ...caseRecord.vendor,
        clarificationHistory: [
          ...caseRecord.vendor.clarificationHistory,
          normaliseClarificationItem({
            direction: 'vendor_response',
            message: safeMessage,
            actor: actorUsername,
            actorRole: 'vendor_contact',
            at: nowIso()
          }, caseRecord.vendor.clarificationHistory.length)
        ],
        latestMessage: 'Vendor responded to the clarification request.'
      }
    }, {
      type: 'clarification_responded',
      actor: actorUsername,
      actorRole: 'vendor_contact',
      message: 'Vendor responded to a clarification request.'
    }));
  }

  function requestClarification(caseId, message = '', { actorUsername = '', actorRole = 'gtr_analyst' } = {}) {
    const safeMessage = String(message || '').trim();
    if (!safeMessage) return getCaseById(caseId);
    return updateCase(caseId, (caseRecord) => appendTimelineEntry({
      ...caseRecord,
      status: 'awaiting_vendor_clarification',
      vendor: {
        ...caseRecord.vendor,
        clarificationHistory: [
          ...caseRecord.vendor.clarificationHistory,
          normaliseClarificationItem({
            direction: 'internal_request',
            message: safeMessage,
            actor: actorUsername,
            actorRole,
            at: nowIso()
          }, caseRecord.vendor.clarificationHistory.length)
        ],
        latestMessage: 'Internal team requested a clarification from the vendor.'
      }
    }, {
      type: 'clarification_requested',
      actor: actorUsername,
      actorRole,
      message: 'Internal team requested a clarification.'
    }));
  }

  function saveInternalDecision(caseId, decision = {}, { actorUsername = '', actorRole = 'approver' } = {}) {
    return updateCase(caseId, (caseRecord) => {
      const nextOutcome = String(decision.outcome || caseRecord.decision.outcome || 'pending').trim();
      const nextStatus = nextOutcome === 'pass'
        ? 'approved'
        : nextOutcome === 'conditional_pass'
          ? 'conditional_pass'
          : nextOutcome === 'fail'
            ? 'fail'
            : caseRecord.status;
      return appendTimelineEntry({
        ...caseRecord,
        status: nextStatus,
        rating: {
          ...caseRecord.rating,
          decisionOutcome: nextOutcome,
          likelihood: String(decision.likelihood || caseRecord.rating.likelihood || 'Medium').trim(),
          impact: String(decision.impact || caseRecord.rating.impact || 'Medium').trim()
        },
        decision: {
          ...caseRecord.decision,
          ...clone(decision),
          outcome: nextOutcome
        }
      }, {
        type: 'decision_updated',
        actor: actorUsername,
        actorRole,
        message: `Internal decision updated to ${nextOutcome || 'pending'}.`
      });
    });
  }

  function saveAiAnalysis(caseId, analysis = {}) {
    return updateCase(caseId, (caseRecord) => ({
      ...appendTimelineEntry({
        ...caseRecord,
        internal: {
          ...caseRecord.internal,
          aiAnalysis: clone(analysis)
        }
      }, {
        type: 'ai_analysis_refreshed',
        actor: 'system',
        actorRole: 'ai_assistant',
        message: 'Backend AI assessment analysis refreshed.'
      })
    }));
  }

  function getDashboardSummary(user = null) {
    const visibleCases = getCasesForUser(user);
    return {
      totalCases: visibleCases.length,
      awaitingVendor: visibleCases.filter(item => item.status === 'awaiting_vendor_clarification' || item.status === 'vendor_in_progress').length,
      internalReview: visibleCases.filter(item => item.status === 'internal_review').length,
      approvalPending: visibleCases.filter(item => item.status === 'approval_pending').length,
      approved: visibleCases.filter(item => ['approved', 'conditional_pass'].includes(item.status)).length,
      periodicDue: visibleCases.filter(item => item.caseType === 'periodic_reassessment').length
    };
  }

  function resetSeedData() {
    return writeRawStore(buildSeedCases());
  }

  const api = {
    STORAGE_KEY,
    getAllCases,
    getCaseById,
    getCasesForUser,
    getPrimaryCaseForUser,
    getDashboardSummary,
    saveVendorQuestionnaire,
    addEvidenceFiles,
    addVendorClarificationResponse,
    requestClarification,
    saveInternalDecision,
    saveAiAnalysis,
    resetSeedData
  };

  globalScope.VendorCaseService = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
