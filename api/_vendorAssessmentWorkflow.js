'use strict';

const VendorRiskTemplateService = require('../assets/services/vendorRiskTemplateService.js');
const { buildTraceEntry, callAi, parseOrRepairStructuredJson, sanitizeAiText } = require('./_aiOrchestrator');
const { buildDeterministicFallbackResult, buildFallbackFromError, buildWorkflowTimeoutProfile } = require('./_aiWorkflowSupport');

const VENDOR_ASSESSMENT_TIMEOUTS = buildWorkflowTimeoutProfile({
  liveMs: 22000,
  repairMs: 10000
});

const ANALYSIS_SCHEMA = `{
  "summaryStatement": "string",
  "serviceType": "ai|saas|consulting|technology_provider|hardware",
  "criticalityTier": "tier_1_critical|tier_2_important|tier_3_low_risk",
  "criticalityRationale": "string",
  "regulatoryImpact": ["string"],
  "recommendedClausePackIds": ["string"],
  "requiredClauseCoverage": [
    {
      "clause": "string",
      "status": "covered|missing|unclear",
      "reason": "string"
    }
  ],
  "riskStatements": [
    {
      "title": "string",
      "statement": "string",
      "likelihood": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "string"
    }
  ],
  "recommendations": ["string"]
}`;

const SERVICE_TYPES = new Set(['ai', 'saas', 'consulting', 'technology_provider', 'hardware']);
const CRITICALITY_TIERS = new Set(['tier_1_critical', 'tier_2_important', 'tier_3_low_risk']);
const COVERAGE_STATUSES = new Set(['covered', 'missing', 'unclear']);
const RISK_BANDS = new Set(['high', 'medium', 'low']);

function toText(value = '', maxChars = 1200) {
  return sanitizeAiText(value, { maxChars });
}

function toShortText(value = '', maxChars = 240) {
  return sanitizeAiText(value, { maxChars });
}

function toStringList(value, { maxItems = 12, maxChars = 240 } = {}) {
  return (Array.isArray(value) ? value : [])
    .map((item) => toText(item, maxChars))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normaliseSubprocessors(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => ({
      name: toShortText(item?.name || '', 160),
      location: toShortText(item?.location || '', 160)
    }))
    .filter((item) => item.name || item.location)
    .slice(0, 12);
}

function normaliseBoolean(value) {
  if (value === true || value === false) return value;
  const safeValue = String(value || '').trim().toLowerCase();
  if (['true', 'yes', 'y', '1'].includes(safeValue)) return true;
  if (['false', 'no', 'n', '0'].includes(safeValue)) return false;
  return false;
}

function normaliseVendorAssessmentInput(source = {}) {
  const serviceTypeHint = toShortText(source.serviceTypeHint || '', 80).toLowerCase();
  return {
    vendorName: toShortText(source.vendorName || '', 200),
    contractDescription: toText(source.contractDescription || '', 2000),
    serviceScope: toText(source.serviceScope || '', 2000),
    serviceTypeHint: SERVICE_TYPES.has(serviceTypeHint) ? serviceTypeHint : '',
    scenarioSummary: toText(source.scenarioSummary || '', 2500),
    dataAccessRequired: normaliseBoolean(source.dataAccessRequired),
    dataTypes: toStringList(source.dataTypes, { maxItems: 12, maxChars: 120 }).map((item) => item.toLowerCase()),
    headquartered: toShortText(source.headquartered || '', 160),
    subprocessors: normaliseSubprocessors(source.subprocessors),
    hostingRegion: toShortText(source.hostingRegion || '', 160),
    businessUnit: toShortText(source.businessUnit || '', 160),
    questionnaireFindings: toStringList(source.questionnaireFindings, { maxItems: 16, maxChars: 500 }),
    evidenceSummaries: toStringList(source.evidenceSummaries, { maxItems: 16, maxChars: 500 }),
    requiredClauses: toStringList(source.requiredClauses, { maxItems: 40, maxChars: 280 }),
    existingContractClauses: toStringList(source.existingContractClauses, { maxItems: 40, maxChars: 280 }),
    traceLabel: toShortText(source.traceLabel || '', 160),
    priorMessages: (Array.isArray(source.priorMessages) ? source.priorMessages : [])
      .map((item) => ({
        role: String(item?.role || '').trim().toLowerCase() === 'assistant' ? 'assistant' : 'user',
        content: toText(item?.content || '', 1000)
      }))
      .filter((item) => item.content)
      .slice(-8)
  };
}

function inferCriticalityTier({ intakeFrame = null, input = null } = {}) {
  const hasSensitiveData = (intakeFrame?.dataAccess?.dataTypes || []).some((value) => (
    /pii|personal|finance|credential|source_code|ip/.test(String(value || '').toLowerCase())
  ));
  const crossBorder = (intakeFrame?.regulatoryImpact || []).includes('cross_border_and_residency');
  const serviceType = String(intakeFrame?.serviceType || input?.serviceTypeHint || '').trim().toLowerCase();
  const hasFindings = Array.isArray(input?.questionnaireFindings) && input.questionnaireFindings.length > 0;
  const hasSubprocessors = Array.isArray(intakeFrame?.technologyProvenance?.subprocessors)
    && intakeFrame.technologyProvenance.subprocessors.length > 0;

  if ((serviceType === 'ai' && (input?.dataAccessRequired || hasSensitiveData)) || (hasSensitiveData && crossBorder)) {
    return 'tier_1_critical';
  }
  if (hasSensitiveData || hasFindings || hasSubprocessors || ['ai', 'saas'].includes(serviceType)) {
    return 'tier_2_important';
  }
  return 'tier_3_low_risk';
}

function buildCoverageRows({ requiredClauses = [], existingContractClauses = [] } = {}) {
  const existing = (Array.isArray(existingContractClauses) ? existingContractClauses : []).map((item) => String(item || '').trim().toLowerCase());
  const required = Array.isArray(requiredClauses) && requiredClauses.length
    ? requiredClauses
    : [];
  return required.map((clause) => {
    const safeClause = toShortText(clause, 240);
    const safeNeedle = safeClause.toLowerCase();
    const matchingExisting = existing.find((item) => item.includes(safeNeedle) || safeNeedle.includes(item));
    if (matchingExisting) {
      return {
        clause: safeClause,
        status: 'covered',
        reason: 'A matching or closely aligned contract clause already appears in the provided clause set.'
      };
    }
    return {
      clause: safeClause,
      status: 'missing',
      reason: 'The provided contract clause set does not clearly show this required clause yet.'
    };
  });
}

function buildDeterministicAssessment(input = {}) {
  const intakeFrame = VendorRiskTemplateService.buildIntakeOutputFrame(input);
  const clauseFrame = VendorRiskTemplateService.buildClauseRecommendationFrame(input);
  const criticalityTier = inferCriticalityTier({ intakeFrame, input });
  const checkpoint = VendorRiskTemplateService.getRiskControlCheckpoint(criticalityTier);
  const requiredClauses = input.requiredClauses.length
    ? input.requiredClauses
    : clauseFrame.recommendedClausePacks.flatMap((pack) => Array.isArray(pack?.clauses) ? pack.clauses : []);
  const requiredClauseCoverage = buildCoverageRows({
    requiredClauses,
    existingContractClauses: input.existingContractClauses
  });
  const serviceTypeLabel = String(intakeFrame?.serviceProfile?.label || intakeFrame?.serviceType || 'vendor service').trim();
  const riskStatements = [];

  if ((intakeFrame?.regulatoryImpact || []).includes('cross_border_and_residency')) {
    riskStatements.push({
      title: 'Cross-border hosting or subprocessor exposure',
      statement: 'Cross-border hosting and subprocessor reliance may increase regulatory, oversight, and contractual control risk if not governed tightly.',
      likelihood: 'medium',
      impact: criticalityTier === 'tier_1_critical' ? 'high' : 'medium',
      mitigation: 'Require explicit hosting, subprocessor, and change-control clauses together with evidence-backed oversight.'
    });
  }
  if (input.dataAccessRequired) {
    riskStatements.push({
      title: 'Customer data handling dependency',
      statement: 'The service depends on supplier controls for customer data access, retention, and secure handling.',
      likelihood: criticalityTier === 'tier_3_low_risk' ? 'low' : 'medium',
      impact: criticalityTier === 'tier_1_critical' ? 'high' : 'medium',
      mitigation: 'Validate data-handling controls, review evidence, and include mandatory data protection and deletion clauses.'
    });
  }
  if (String(intakeFrame?.serviceType || '') === 'ai') {
    riskStatements.push({
      title: 'AI governance and output custodianship risk',
      statement: 'AI-enabled services introduce additional governance, output ownership, and lawful processing obligations.',
      likelihood: 'medium',
      impact: 'high',
      mitigation: 'Apply AI-specific clauses, validate data sources and methods, and review evidence for model and data governance.'
    });
  }

  const recommendations = [
    `Use ${serviceTypeLabel} as the primary service type for the detailed assessment path.`,
    `Apply the ${checkpoint?.label || 'required'} control checkpoint and decision path.`,
    'Run clause selection and wording review through Legal because the clause set varies by service and product nature.'
  ];
  if (requiredClauseCoverage.some((item) => item.status === 'missing')) {
    recommendations.push('Add missing mandatory clause coverage before approval or contract finalisation.');
  }
  if (input.evidenceSummaries.length) {
    recommendations.push('Use server-side AI evidence review to compare uploaded assurance artifacts against control claims and clause requirements.');
  }

  return {
    summaryStatement: `${input.vendorName || 'The vendor'} is being assessed as a ${serviceTypeLabel} engagement. The deterministic review recommends ${checkpoint?.label || 'the current'} control checkpoint based on service type, data profile, operating model, and clause applicability.`,
    serviceType: String(intakeFrame?.serviceType || input.serviceTypeHint || 'technology_provider'),
    criticalityTier,
    criticalityRationale: `Derived from service type, data access, hosting and subprocessor context, and the current assessment signal set.`,
    regulatoryImpact: Array.isArray(intakeFrame?.regulatoryImpact) ? intakeFrame.regulatoryImpact.slice(0, 8) : [],
    recommendedClausePackIds: clauseFrame.packIds.slice(0, 8),
    requiredClauseCoverage,
    riskStatements: riskStatements.slice(0, 4),
    recommendations: recommendations.slice(0, 8),
    riskControlCheckpoint: checkpoint
  };
}

function normaliseCoverageRows(rows = [], fallbackRows = []) {
  const safeFallback = Array.isArray(fallbackRows) ? fallbackRows : [];
  const safeRows = (Array.isArray(rows) ? rows : [])
    .map((item) => ({
      clause: toShortText(item?.clause || '', 240),
      status: COVERAGE_STATUSES.has(String(item?.status || '').trim().toLowerCase())
        ? String(item.status).trim().toLowerCase()
        : 'unclear',
      reason: toText(item?.reason || '', 500)
    }))
    .filter((item) => item.clause)
    .slice(0, 40);
  return safeRows.length ? safeRows : safeFallback;
}

function normaliseRiskStatements(items = [], fallbackItems = []) {
  const safeFallback = Array.isArray(fallbackItems) ? fallbackItems : [];
  const safeItems = (Array.isArray(items) ? items : [])
    .map((item) => {
      const likelihood = String(item?.likelihood || '').trim().toLowerCase();
      const impact = String(item?.impact || '').trim().toLowerCase();
      return {
        title: toShortText(item?.title || '', 180),
        statement: toText(item?.statement || '', 700),
        likelihood: RISK_BANDS.has(likelihood) ? likelihood : 'medium',
        impact: RISK_BANDS.has(impact) ? impact : 'medium',
        mitigation: toText(item?.mitigation || '', 500)
      };
    })
    .filter((item) => item.title && item.statement)
    .slice(0, 6);
  return safeItems.length ? safeItems : safeFallback;
}

function normaliseAnalysisResult(parsed = {}, fallback = {}) {
  const serviceType = String(parsed?.serviceType || '').trim().toLowerCase();
  const criticalityTier = String(parsed?.criticalityTier || '').trim().toLowerCase();
  const packIds = Array.isArray(parsed?.recommendedClausePackIds) ? parsed.recommendedClausePackIds : [];
  const supportedPackIds = new Set(VendorRiskTemplateService.listContractClausePacks().map((pack) => pack.id));

  return {
    summaryStatement: toText(parsed?.summaryStatement || fallback.summaryStatement || '', 1800),
    serviceType: SERVICE_TYPES.has(serviceType) ? serviceType : fallback.serviceType,
    criticalityTier: CRITICALITY_TIERS.has(criticalityTier) ? criticalityTier : fallback.criticalityTier,
    criticalityRationale: toText(parsed?.criticalityRationale || fallback.criticalityRationale || '', 900),
    regulatoryImpact: toStringList(parsed?.regulatoryImpact, { maxItems: 10, maxChars: 120 }),
    recommendedClausePackIds: packIds
      .map((item) => String(item || '').trim())
      .filter((item) => supportedPackIds.has(item))
      .slice(0, 12),
    requiredClauseCoverage: normaliseCoverageRows(parsed?.requiredClauseCoverage, fallback.requiredClauseCoverage),
    riskStatements: normaliseRiskStatements(parsed?.riskStatements, fallback.riskStatements),
    recommendations: toStringList(parsed?.recommendations, { maxItems: 10, maxChars: 500 }),
    riskControlCheckpoint: VendorRiskTemplateService.getRiskControlCheckpoint(
      CRITICALITY_TIERS.has(criticalityTier) ? criticalityTier : fallback.criticalityTier
    )
  };
}

function classifyFallbackReason(error) {
  const message = String(error?.message || error || '').trim();
  if (/timed out/i.test(message)) {
    return {
      code: 'vendor_assessment_ai_timeout',
      title: 'AI analysis timed out',
      message: 'The server-side vendor assessment analysis timed out, so deterministic fallback was used instead.'
    };
  }
  if (/AI_PROXY_UNAVAILABLE|not configured/i.test(message)) {
    return {
      code: 'vendor_assessment_ai_unavailable',
      title: 'Hosted AI is unavailable',
      message: 'The hosted AI proxy is not configured or could not be reached, so deterministic fallback was used instead.'
    };
  }
  return {
    code: 'vendor_assessment_ai_fallback',
    title: 'Server-side AI analysis fell back',
    message: 'The AI analysis could not complete cleanly, so deterministic fallback was used instead.'
  };
}

function buildPromptContext(input = {}, baseline = {}) {
  const clauseFrame = VendorRiskTemplateService.buildClauseRecommendationFrame(input);
  return `Vendor case context:
${JSON.stringify({
    vendorName: input.vendorName,
    contractDescription: input.contractDescription,
    serviceScope: input.serviceScope,
    scenarioSummary: input.scenarioSummary,
    serviceTypeHint: input.serviceTypeHint,
    dataAccessRequired: input.dataAccessRequired,
    dataTypes: input.dataTypes,
    headquartered: input.headquartered,
    hostingRegion: input.hostingRegion,
    subprocessors: input.subprocessors,
    businessUnit: input.businessUnit,
    questionnaireFindings: input.questionnaireFindings,
    evidenceSummaries: input.evidenceSummaries
  }, null, 2)}

Deterministic baseline analysis:
${JSON.stringify(baseline, null, 2)}

Clause recommendation baseline:
${JSON.stringify({
    packIds: clauseFrame.packIds,
    tailoringFactors: clauseFrame.tailoringFactors
  }, null, 2)}

Required clauses to check against:
${JSON.stringify(input.requiredClauses, null, 2)}

Existing contract clauses:
${JSON.stringify(input.existingContractClauses, null, 2)}`;
}

async function buildVendorAssessmentAnalysisWorkflow(input = {}, { traceLabelDefault = 'Vendor assessment analysis' } = {}) {
  const normalisedInput = normaliseVendorAssessmentInput(input);
  const deterministic = buildDeterministicAssessment(normalisedInput);
  const systemPrompt = `You are a Group Technology Risk analyst evaluating a vendor case for service classification, clause applicability, risk framing, and decision support.

Return JSON only with this schema:
${ANALYSIS_SCHEMA}

Rules:
- assess the vendor against required clauses, scenario context, service type, data profile, hosting model, and subprocessors
- prefer the most defensible service type and criticality tier from the provided facts
- do not recommend contract clauses as one static schedule; vary them by service and product nature
- treat AI, SaaS, consulting, and technology-provider cases differently when selecting clause packs
- compare required clauses against existing clauses and mark each as covered, missing, or unclear
- write concise risk statements with likelihood, impact, and mitigation
- keep recommendations practical for GTR, Privacy, Legal, and Approver reviewers`;

  const userPrompt = buildPromptContext(normalisedInput, deterministic);

  try {
    const aiResult = await callAi(systemPrompt, userPrompt, {
      taskName: 'vendorAssessmentAnalysis',
      temperature: 0.1,
      maxCompletionTokens: 2200,
      maxPromptChars: 22000,
      timeoutMs: VENDOR_ASSESSMENT_TIMEOUTS.liveMs,
      priorMessages: normalisedInput.priorMessages
    });
    const parsed = await parseOrRepairStructuredJson(aiResult.text, ANALYSIS_SCHEMA, {
      taskName: 'vendorAssessmentAnalysisRepair',
      timeoutMs: VENDOR_ASSESSMENT_TIMEOUTS.repairMs,
      maxCompletionTokens: 1800,
      maxPromptChars: 14000
    });
    const analysis = normaliseAnalysisResult(parsed?.parsed || parsed, deterministic);
    return {
      mode: 'live',
      ...analysis,
      usedFallback: false,
      aiUnavailable: false,
      trace: buildTraceEntry({
        label: normalisedInput.traceLabel || traceLabelDefault,
        promptSummary: aiResult.promptSummary,
        response: aiResult.text
      })
    };
  } catch (error) {
    return buildFallbackFromError({
      error,
      classifyFallbackReason,
      buildFallbackResult: ({ fallbackReason, aiUnavailable, normalisedError }) => buildDeterministicFallbackResult({
        baseResult: deterministic,
        fallbackReason,
        aiUnavailable,
        traceLabel: normalisedInput.traceLabel || traceLabelDefault,
        promptSummary: buildPromptContext(normalisedInput, deterministic),
        response: String(normalisedError?.message || normalisedError || 'Deterministic vendor assessment fallback used.')
      })
    });
  }
}

module.exports = {
  buildVendorAssessmentAnalysisWorkflow,
  buildDeterministicAssessment,
  normaliseVendorAssessmentInput
};
