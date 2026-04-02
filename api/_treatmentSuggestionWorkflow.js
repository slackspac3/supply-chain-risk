'use strict';

const { getCompassProviderConfig } = require('./_aiRuntime');
const { buildTraceEntry, callAi, normaliseAiError, parseOrRepairStructuredJson, sanitizeAiText } = require('./_aiOrchestrator');
const { workflowUtils } = require('./_scenarioDraftWorkflow');

const {
  buildContextPromptBlock,
  buildEvidenceMeta,
  cleanUserFacingText,
  truncateText,
  withEvidenceMeta
} = workflowUtils;

function normaliseBenchmarkBasis(value = '') {
  return cleanUserFacingText(value, { maxSentences: 3 });
}

function normaliseInputRationale(value = {}) {
  return {
    tef: cleanUserFacingText(value?.tef || '', { maxSentences: 2 }),
    vulnerability: cleanUserFacingText(value?.vulnerability || '', { maxSentences: 2 }),
    lossComponents: cleanUserFacingText(value?.lossComponents || '', { maxSentences: 2 })
  };
}

function normaliseGuidance(items = []) {
  return Array.from(new Set((Array.isArray(items) ? items : [])
    .map((item) => cleanUserFacingText(item, { maxSentences: 1, stripTrailingPeriod: true }))
    .filter(Boolean)))
    .slice(0, 5);
}

function ensureRange(value, fallbackRange) {
  const toNumber = (next, fallback = 0) => {
    const parsed = Number(next);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  return {
    min: toNumber(value?.min, toNumber(fallbackRange?.min, 0)),
    likely: toNumber(value?.likely, toNumber(fallbackRange?.likely, 0)),
    max: toNumber(value?.max, toNumber(fallbackRange?.max, 0))
  };
}

function buildTreatmentImprovementStub(input = {}) {
  const request = String(input.improvementRequest || '').toLowerCase();
  const baseline = input.baselineAssessment?.fairParams || input.baselineAssessment?.results?.inputs || {};
  const next = JSON.parse(JSON.stringify(baseline || {}));
  const notes = [];
  const adjust = (key, factor, floor = null, ceil = null) => {
    const current = Number(next[key]);
    if (!Number.isFinite(current)) return;
    let value = current * factor;
    if (floor != null) value = Math.max(floor, value);
    if (ceil != null) value = Math.min(ceil, value);
    next[key] = Number(value.toFixed(2));
  };

  if (/control|mfa|access|identity|monitor|detect|response/.test(request)) {
    adjust('controlStrMin', 1.12, 0, 0.99);
    adjust('controlStrLikely', 1.15, 0, 0.99);
    adjust('controlStrMax', 1.1, 0, 0.995);
    adjust('vulnMin', 0.9, 0.01, 1);
    adjust('vulnLikely', 0.85, 0.01, 1);
    adjust('vulnMax', 0.82, 0.01, 1);
    notes.push('Control strength has been lifted to reflect stronger preventive and detective controls.');
  }
  if (/less exposure|lower exposure|reduc|contain|segmentation|hardening/.test(request)) {
    adjust('threatCapMin', 0.95, 0, 1);
    adjust('threatCapLikely', 0.92, 0, 1);
    adjust('threatCapMax', 0.9, 0, 1);
    adjust('vulnMin', 0.88, 0.01, 1);
    adjust('vulnLikely', 0.82, 0.01, 1);
    adjust('vulnMax', 0.78, 0.01, 1);
    notes.push('Exposure has been reduced to reflect better containment and lower successful attack opportunity.');
  }
  if (/less financial|lower loss|cheaper|reduce cost|lower disruption|resilience|faster recovery/.test(request)) {
    ['biMin', 'biLikely', 'biMax'].forEach((key, idx) => adjust(key, [0.75, 0.7, 0.68][idx], 0, null));
    ['irMin', 'irLikely', 'irMax'].forEach((key, idx) => adjust(key, [0.9, 0.88, 0.86][idx], 0, null));
    ['rcMin', 'rcLikely', 'rcMax'].forEach((key, idx) => adjust(key, [0.92, 0.88, 0.85][idx], 0, null));
    notes.push('Financial and disruption losses have been reduced to reflect faster containment, better resilience, or lower downstream harm.');
  }
  if (/less frequent|lower frequency|rarer|harder to happen|prevent/.test(request)) {
    ['tefMin', 'tefLikely', 'tefMax'].forEach((key, idx) => adjust(key, [0.85, 0.78, 0.72][idx], 0.1, null));
    notes.push('Event frequency has been reduced to reflect lower likelihood under the improved future state.');
  }
  if (!notes.length) {
    adjust('controlStrLikely', 1.08, 0, 0.99);
    adjust('tefLikely', 0.9, 0.1, null);
    adjust('biLikely', 0.9, 0, null);
    notes.push('The future-state case assumes moderately stronger controls, lower event success, and better operational containment.');
  }
  return {
    summary: 'The future-state case adjusts the baseline to reflect the improvement described by the user.',
    changesSummary: notes.join(' '),
    workflowGuidance: [
      'Review the adjusted values and make sure they reflect a credible future state rather than an ideal one.',
      'Focus on the one or two assumptions that would realistically improve first, then rerun the model.',
      'Use the comparison view to judge whether the improvement meaningfully changes tolerance position.'
    ],
    benchmarkBasis: 'The adjusted values represent a future-state comparison case. They should reflect plausible control or resilience improvements, not best-case assumptions.',
    inputRationale: {
      tef: 'Frequency was reduced only where the requested improvement would plausibly lower how often the scenario succeeds.',
      vulnerability: 'Exposure was reduced where stronger controls, better identity protection, or tighter containment were implied by the request.',
      lossComponents: 'Loss values were reduced where the request suggests faster recovery, lower disruption, or less downstream financial impact.'
    },
    suggestedInputs: {
      TEF: { min: next.tefMin, likely: next.tefLikely, max: next.tefMax },
      controlStrength: { min: next.controlStrMin, likely: next.controlStrLikely, max: next.controlStrMax },
      threatCapability: { min: next.threatCapMin, likely: next.threatCapLikely, max: next.threatCapMax },
      lossComponents: {
        incidentResponse: { min: next.irMin, likely: next.irLikely, max: next.irMax },
        businessInterruption: { min: next.biMin, likely: next.biLikely, max: next.biMax },
        dataBreachRemediation: { min: next.dbMin, likely: next.dbLikely, max: next.dbMax },
        regulatoryLegal: { min: next.rlMin, likely: next.rlLikely, max: next.rlMax },
        thirdPartyLiability: { min: next.tpMin, likely: next.tpLikely, max: next.tpMax },
        reputationContract: { min: next.rcMin, likely: next.rcLikely, max: next.rcMax }
      }
    },
    citations: Array.isArray(input.citations) ? input.citations : []
  };
}

function buildFallbackTreatmentSuggestionResult(input = {}, {
  aiUnavailable = false,
  traceLabel = 'Step 3 treatment suggestion',
  fallbackReason = null
} = {}) {
  const evidenceMeta = buildEvidenceMeta({
    citations: input.citations || [],
    businessUnit: input.businessUnit,
    geography: input.baselineAssessment?.geography || input.businessUnit?.geography,
    applicableRegulations: input.baselineAssessment?.applicableRegulations,
    organisationContext: input.baselineAssessment?.narrative,
    uploadedText: input.improvementRequest,
    adminSettings: input.adminSettings,
    userProfile: input.adminSettings?.userProfileSummary
  });
  const stub = buildTreatmentImprovementStub(input);
  return withEvidenceMeta({
    mode: 'deterministic_fallback',
    ...stub,
    usedFallback: true,
    aiUnavailable,
    fallbackReasonCode: fallbackReason?.code || 'server_treatment_fallback',
    fallbackReasonTitle: fallbackReason?.title || 'Deterministic fallback treatment suggestion loaded',
    fallbackReasonMessage: fallbackReason?.message || 'The server used a deterministic future-state suggestion instead of live AI for this better-outcome case.',
    fallbackReasonDetail: fallbackReason?.detail || '',
    trace: buildTraceEntry({
      label: traceLabel,
      promptSummary: 'Server deterministic fallback used for Step 3 treatment suggestion.',
      response: stub.changesSummary || stub.summary,
      sources: input.citations || []
    })
  }, evidenceMeta);
}

function classifyTreatmentFallbackReason(error = null) {
  const message = String(error?.message || error || '').trim();
  const safeMessage = sanitizeAiText(message, { maxChars: 220 });
  const withDetail = (base, detail) => ({
    ...base,
    detail: String(detail || '').trim()
  });
  if (!safeMessage) {
    return withDetail({
      code: 'no_ai_response',
      title: 'Deterministic fallback treatment suggestion loaded',
      message: 'The server did not receive a usable AI response, so it used deterministic future-state adjustments instead.'
    }, 'No response content was returned.');
  }
  if (/Hosted AI proxy is not configured|Missing COMPASS_API_KEY secret/i.test(safeMessage)) {
    return withDetail({
      code: 'proxy_missing_secret',
      title: 'Deterministic fallback treatment suggestion loaded',
      message: 'The hosted AI proxy is not configured, so the server used deterministic future-state adjustments instead.'
    }, 'The proxy is missing its Compass configuration.');
  }
  return withDetail({
    code: 'ai_runtime_error',
    title: 'Deterministic fallback treatment suggestion loaded',
    message: 'The AI treatment-suggestion step failed at runtime, so the server used deterministic future-state adjustments instead.'
  }, safeMessage);
}

function normaliseTreatmentSuggestionCandidate(parsed = {}, fallback = {}, input = {}) {
  const fallbackSuggestedInputs = fallback.suggestedInputs || {};
  const fallbackLossComponents = fallbackSuggestedInputs.lossComponents || {};
  return {
    summary: cleanUserFacingText(parsed.summary || fallback.summary || '', { maxSentences: 2 }),
    changesSummary: cleanUserFacingText(parsed.changesSummary || fallback.changesSummary || '', { maxSentences: 3 }),
    workflowGuidance: normaliseGuidance(parsed.workflowGuidance?.length ? parsed.workflowGuidance : fallback.workflowGuidance),
    benchmarkBasis: normaliseBenchmarkBasis(parsed.benchmarkBasis || fallback.benchmarkBasis || ''),
    inputRationale: normaliseInputRationale({ ...fallback.inputRationale, ...(parsed.inputRationale || {}) }),
    suggestedInputs: {
      TEF: ensureRange(parsed?.suggestedInputs?.TEF, fallbackSuggestedInputs.TEF),
      controlStrength: ensureRange(parsed?.suggestedInputs?.controlStrength, fallbackSuggestedInputs.controlStrength),
      threatCapability: ensureRange(parsed?.suggestedInputs?.threatCapability, fallbackSuggestedInputs.threatCapability),
      lossComponents: {
        incidentResponse: ensureRange(parsed?.suggestedInputs?.lossComponents?.incidentResponse, fallbackLossComponents.incidentResponse),
        businessInterruption: ensureRange(parsed?.suggestedInputs?.lossComponents?.businessInterruption, fallbackLossComponents.businessInterruption),
        dataBreachRemediation: ensureRange(parsed?.suggestedInputs?.lossComponents?.dataBreachRemediation, fallbackLossComponents.dataBreachRemediation),
        regulatoryLegal: ensureRange(parsed?.suggestedInputs?.lossComponents?.regulatoryLegal, fallbackLossComponents.regulatoryLegal),
        thirdPartyLiability: ensureRange(parsed?.suggestedInputs?.lossComponents?.thirdPartyLiability, fallbackLossComponents.thirdPartyLiability),
        reputationContract: ensureRange(parsed?.suggestedInputs?.lossComponents?.reputationContract, fallbackLossComponents.reputationContract)
      }
    },
    citations: Array.isArray(input.citations) ? input.citations : []
  };
}

async function buildTreatmentSuggestionWorkflow(input = {}) {
  const traceLabel = sanitizeAiText(input.traceLabel || 'Step 3 treatment suggestion', { maxChars: 120 }) || 'Step 3 treatment suggestion';
  const config = getCompassProviderConfig();
  if (!config.proxyConfigured) {
    return buildFallbackTreatmentSuggestionResult(input, {
      aiUnavailable: true,
      traceLabel,
      fallbackReason: classifyTreatmentFallbackReason(new Error('Hosted AI proxy is not configured.'))
    });
  }

  const fallback = buildTreatmentImprovementStub(input);
  const evidenceMeta = buildEvidenceMeta({
    citations: input.citations || [],
    businessUnit: input.businessUnit,
    geography: input.baselineAssessment?.geography || input.businessUnit?.geography,
    applicableRegulations: input.baselineAssessment?.applicableRegulations,
    organisationContext: input.baselineAssessment?.narrative,
    uploadedText: input.improvementRequest,
    adminSettings: input.adminSettings,
    userProfile: input.adminSettings?.userProfileSummary
  });
  const outputSchema = `{
  "summary": "string",
  "changesSummary": "string",
  "workflowGuidance": ["string"],
  "benchmarkBasis": "string",
  "inputRationale": {
    "tef": "string",
    "vulnerability": "string",
    "lossComponents": "string"
  },
  "suggestedInputs": {
    "TEF": { "min": number, "likely": number, "max": number },
    "controlStrength": { "min": number, "likely": number, "max": number },
    "threatCapability": { "min": number, "likely": number, "max": number },
    "lossComponents": {
      "incidentResponse": { "min": number, "likely": number, "max": number },
      "businessInterruption": { "min": number, "likely": number, "max": number },
      "dataBreachRemediation": { "min": number, "likely": number, "max": number },
      "regulatoryLegal": { "min": number, "likely": number, "max": number },
      "thirdPartyLiability": { "min": number, "likely": number, "max": number },
      "reputationContract": { "min": number, "likely": number, "max": number }
    }
  }
}`;
  const systemPrompt = `You are a senior FAIR analyst helping a user model an improved future state.

Return JSON only with this schema:
${outputSchema}

Rules:
- treat this as a future-state comparison case, not a rewrite of the original scenario
- adjust only the FAIR inputs that are plausibly improved by the user's request
- keep changes credible and proportionate
- do not reduce every value automatically; preserve unchanged inputs where the request does not justify a shift
- explain the future-state logic in plain business language`;
  const fairInputs = input.baselineAssessment?.fairParams || input.baselineAssessment?.results?.inputs || {};
  const userPrompt = `Baseline scenario title: ${input.baselineAssessment?.scenarioTitle || 'Untitled scenario'}
Baseline narrative: ${truncateText(input.baselineAssessment?.enhancedNarrative || input.baselineAssessment?.narrative || '', 1400)}
Business unit: ${input.businessUnit?.name || 'Unknown'}
Geography: ${input.baselineAssessment?.geography || input.businessUnit?.geography || 'Unknown'}
User improvement request: ${truncateText(input.improvementRequest || '(none)', 1200)}
Current FAIR inputs:
${JSON.stringify(fairInputs, null, 2)}
Live scoped context:
${truncateText(buildContextPromptBlock(input.adminSettings || {}, input.businessUnit || null), 1400)}

Instructions:
- treat this as a future-state comparison case, not a rewrite of the original scenario
- adjust only the FAIR inputs that are plausibly improved by the user's request
- keep changes credible and proportionate
- explain what changed in plain language
- prefer stronger controls, lower event frequency, lower vulnerability, or lower loss only when justified by the user's request

Evidence quality context:
${truncateText(evidenceMeta.promptBlock || '', 320)}`;

  try {
    const generation = await callAi(systemPrompt, userPrompt, {
      taskName: 'suggestTreatmentImprovement',
      temperature: 0.2,
      maxCompletionTokens: 1800,
      maxPromptChars: 10000,
      timeoutMs: 30000,
      priorMessages: Array.isArray(input?.priorMessages) ? input.priorMessages : []
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, outputSchema, {
      taskName: 'repairSuggestTreatmentImprovement'
    });
    const candidate = normaliseTreatmentSuggestionCandidate(parsed?.parsed || {}, fallback, input);
    return withEvidenceMeta({
      mode: 'live',
      ...candidate,
      usedFallback: false,
      aiUnavailable: false,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: generation.promptSummary,
        response: generation.text,
        sources: input.citations || []
      })
    }, evidenceMeta);
  } catch (error) {
    const normalisedError = normaliseAiError(error);
    const fallbackReason = classifyTreatmentFallbackReason(normalisedError);
    const aiUnavailable = !/invalid_ai_output|unexpected_response_shape/i.test(String(fallbackReason.code || ''));
    console.warn('buildTreatmentSuggestionWorkflow server fallback:', normalisedError.message);
    return buildFallbackTreatmentSuggestionResult(input, {
      aiUnavailable,
      traceLabel,
      fallbackReason
    });
  }
}

module.exports = {
  buildTreatmentSuggestionWorkflow
};
