'use strict';

const { getCompassProviderConfig } = require('./_aiRuntime');
const { buildTraceEntry, callAi, normaliseAiError, parseOrRepairStructuredJson, sanitizeAiText } = require('./_aiOrchestrator');
const { buildDeterministicFallbackResult, buildFallbackFromError, buildManualModeResult, buildWorkflowTimeoutProfile } = require('./_aiWorkflowSupport');
const { workflowUtils } = require('./_scenarioDraftWorkflow');

const {
  buildContextPromptBlock,
  buildEvidenceMeta,
  cleanUserFacingText,
  compactInputValue,
  normaliseAdminSettingsInput,
  normaliseBlockInputText,
  normaliseBusinessUnitInput,
  normaliseCitationInputs,
  normaliseInlineInputText,
  normalisePriorMessagesInput,
  normaliseStringListInput,
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

function normaliseFairParamsInput(value = {}) {
  if (!workflowUtils.isPlainObject || !workflowUtils.isPlainObject(value)) return undefined;
  const next = {};
  Object.entries(value).forEach(([key, item]) => {
    const parsed = Number(item);
    if (Number.isFinite(parsed)) next[key] = parsed;
  });
  return Object.keys(next).length ? next : undefined;
}

function normaliseResultsInput(value = {}) {
  if (!workflowUtils.isPlainObject || !workflowUtils.isPlainObject(value)) return undefined;
  return compactInputValue({
    inputs: normaliseFairParamsInput(value.inputs)
  });
}

function normaliseBaselineAssessmentInput(value = {}) {
  if (!workflowUtils.isPlainObject || !workflowUtils.isPlainObject(value)) return undefined;
  return compactInputValue({
    scenarioTitle: normaliseInlineInputText(value.scenarioTitle || ''),
    narrative: normaliseBlockInputText(value.narrative || ''),
    enhancedNarrative: normaliseBlockInputText(value.enhancedNarrative || ''),
    geography: normaliseInlineInputText(value.geography || ''),
    applicableRegulations: normaliseStringListInput(value.applicableRegulations, { maxItems: 12 }),
    fairParams: normaliseFairParamsInput(value.fairParams),
    results: normaliseResultsInput(value.results)
  });
}

function normaliseTreatmentSuggestionInput(input = {}) {
  return compactInputValue({
    baselineAssessment: normaliseBaselineAssessmentInput(input.baselineAssessment),
    improvementRequest: normaliseBlockInputText(input.improvementRequest || ''),
    businessUnit: normaliseBusinessUnitInput(input.businessUnit),
    adminSettings: normaliseAdminSettingsInput(input.adminSettings),
    citations: normaliseCitationInputs(input.citations),
    priorMessages: normalisePriorMessagesInput(input.priorMessages),
    traceLabel: normaliseInlineInputText(input.traceLabel || '')
  }) || {};
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
  return buildDeterministicFallbackResult({
    baseResult: {
      ...stub
    },
    fallbackReason: fallbackReason || {
      code: 'server_treatment_fallback',
      title: 'Deterministic fallback treatment suggestion loaded',
      message: 'The server used a deterministic future-state suggestion instead of live AI for this better-outcome case.',
      detail: ''
    },
    aiUnavailable,
    traceLabel,
    promptSummary: 'Server deterministic fallback used for Step 3 treatment suggestion.',
    response: stub.changesSummary || stub.summary,
    sources: input.citations || [],
    evidenceMeta,
    withEvidenceMeta
  });
}

function hasMeaningfulTreatmentBaseline(input = {}) {
  const baseline = input?.baselineAssessment || {};
  const fairInputs = baseline?.fairParams || baseline?.results?.inputs || {};
  const hasNumericInput = [
    'tefMin', 'tefLikely', 'tefMax',
    'controlStrMin', 'controlStrLikely', 'controlStrMax',
    'threatCapMin', 'threatCapLikely', 'threatCapMax',
    'biLikely', 'irLikely', 'rcLikely'
  ].some((key) => Number.isFinite(Number(fairInputs?.[key])));
  const baselineContext = cleanUserFacingText(
    baseline?.enhancedNarrative || baseline?.narrative || baseline?.scenarioTitle || '',
    { maxSentences: 2 }
  );
  return hasNumericInput || baselineContext.length >= 12;
}

function hasMeaningfulTreatmentRequest(input = {}) {
  const request = cleanUserFacingText(input?.improvementRequest || '', { maxSentences: 2 });
  return request.length >= 10;
}

function buildManualTreatmentSuggestionResult(input = {}, { traceLabel = 'Step 3 treatment suggestion' } = {}) {
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
  return buildManualModeResult({
    baseResult: {
      summary: 'The better-outcome case stayed manual because the current request or baseline data is incomplete.',
      changesSummary: 'No treatment adjustments were applied.',
      workflowGuidance: [
        'Describe the improvement you want to test in one plain sentence.',
        'Make sure the baseline scenario or FAIR inputs are filled in first.',
        'Then try the better-outcome assist again.'
      ],
      benchmarkBasis: 'This step stayed in manual mode because the current treatment request or baseline data is too limited for a reliable server suggestion.',
      inputRationale: {
        tef: '',
        vulnerability: '',
        lossComponents: ''
      },
      suggestedInputs: {},
      citations: Array.isArray(input.citations) ? input.citations : []
    },
    manualReason: {
      code: 'incomplete_treatment_input',
      title: 'Manual treatment guidance only',
      message: 'Add a clearer improvement request and baseline scenario data before asking the server for a better-outcome suggestion.'
    },
    traceLabel,
    promptSummary: 'Server manual mode used for Step 3 treatment suggestion because the request or baseline data was incomplete.',
    response: 'The treatment-suggestion step stayed in manual mode because the input was incomplete.',
    sources: input.citations || [],
    evidenceMeta,
    withEvidenceMeta
  });
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

function hasCompleteNumericRange(value = {}) {
  return ['min', 'likely', 'max'].every((key) => Number.isFinite(Number(value?.[key])));
}

function normaliseTreatmentSuggestionCandidate(parsed = {}, fallbackSource = null, input = {}) {
  let resolvedFallback = null;
  const getFallback = () => {
    if (resolvedFallback === null) {
      const next = typeof fallbackSource === 'function' ? fallbackSource() : fallbackSource;
      resolvedFallback = next && typeof next === 'object' ? next : {};
    }
    return resolvedFallback;
  };
  const parsedSummary = cleanUserFacingText(parsed.summary || '', { maxSentences: 2 });
  const parsedChangesSummary = cleanUserFacingText(parsed.changesSummary || '', { maxSentences: 3 });
  const parsedWorkflowGuidance = normaliseGuidance(parsed.workflowGuidance);
  const parsedBenchmarkBasis = normaliseBenchmarkBasis(parsed.benchmarkBasis || '');
  const parsedInputRationale = normaliseInputRationale(parsed.inputRationale || {});
  const parsedSuggestedInputs = parsed?.suggestedInputs && typeof parsed.suggestedInputs === 'object' ? parsed.suggestedInputs : {};
  const getFallbackSuggestedInputs = () => (getFallback().suggestedInputs || {});
  const getFallbackLossComponents = () => (getFallbackSuggestedInputs().lossComponents || {});
  return {
    summary: parsedSummary || cleanUserFacingText(getFallback().summary || '', { maxSentences: 2 }),
    changesSummary: parsedChangesSummary || cleanUserFacingText(getFallback().changesSummary || '', { maxSentences: 3 }),
    workflowGuidance: parsedWorkflowGuidance.length ? parsedWorkflowGuidance : normaliseGuidance(getFallback().workflowGuidance),
    benchmarkBasis: parsedBenchmarkBasis || normaliseBenchmarkBasis(getFallback().benchmarkBasis || ''),
    inputRationale: {
      tef: parsedInputRationale.tef || normaliseInputRationale(getFallback().inputRationale || {}).tef,
      vulnerability: parsedInputRationale.vulnerability || normaliseInputRationale(getFallback().inputRationale || {}).vulnerability,
      lossComponents: parsedInputRationale.lossComponents || normaliseInputRationale(getFallback().inputRationale || {}).lossComponents
    },
    suggestedInputs: {
      TEF: ensureRange(parsedSuggestedInputs.TEF, hasCompleteNumericRange(parsedSuggestedInputs.TEF) ? parsedSuggestedInputs.TEF : getFallbackSuggestedInputs().TEF),
      controlStrength: ensureRange(parsedSuggestedInputs.controlStrength, hasCompleteNumericRange(parsedSuggestedInputs.controlStrength) ? parsedSuggestedInputs.controlStrength : getFallbackSuggestedInputs().controlStrength),
      threatCapability: ensureRange(parsedSuggestedInputs.threatCapability, hasCompleteNumericRange(parsedSuggestedInputs.threatCapability) ? parsedSuggestedInputs.threatCapability : getFallbackSuggestedInputs().threatCapability),
      lossComponents: {
        incidentResponse: ensureRange(parsedSuggestedInputs?.lossComponents?.incidentResponse, hasCompleteNumericRange(parsedSuggestedInputs?.lossComponents?.incidentResponse) ? parsedSuggestedInputs.lossComponents.incidentResponse : getFallbackLossComponents().incidentResponse),
        businessInterruption: ensureRange(parsedSuggestedInputs?.lossComponents?.businessInterruption, hasCompleteNumericRange(parsedSuggestedInputs?.lossComponents?.businessInterruption) ? parsedSuggestedInputs.lossComponents.businessInterruption : getFallbackLossComponents().businessInterruption),
        dataBreachRemediation: ensureRange(parsedSuggestedInputs?.lossComponents?.dataBreachRemediation, hasCompleteNumericRange(parsedSuggestedInputs?.lossComponents?.dataBreachRemediation) ? parsedSuggestedInputs.lossComponents.dataBreachRemediation : getFallbackLossComponents().dataBreachRemediation),
        regulatoryLegal: ensureRange(parsedSuggestedInputs?.lossComponents?.regulatoryLegal, hasCompleteNumericRange(parsedSuggestedInputs?.lossComponents?.regulatoryLegal) ? parsedSuggestedInputs.lossComponents.regulatoryLegal : getFallbackLossComponents().regulatoryLegal),
        thirdPartyLiability: ensureRange(parsedSuggestedInputs?.lossComponents?.thirdPartyLiability, hasCompleteNumericRange(parsedSuggestedInputs?.lossComponents?.thirdPartyLiability) ? parsedSuggestedInputs.lossComponents.thirdPartyLiability : getFallbackLossComponents().thirdPartyLiability),
        reputationContract: ensureRange(parsedSuggestedInputs?.lossComponents?.reputationContract, hasCompleteNumericRange(parsedSuggestedInputs?.lossComponents?.reputationContract) ? parsedSuggestedInputs.lossComponents.reputationContract : getFallbackLossComponents().reputationContract)
      }
    },
    citations: Array.isArray(input.citations) ? input.citations : []
  };
}

const TREATMENT_SUGGESTION_TIMEOUTS = buildWorkflowTimeoutProfile({
  liveMs: 20000,
  repairMs: 10000
});

async function buildTreatmentSuggestionWorkflow(input = {}) {
  input = normaliseTreatmentSuggestionInput(input);
  const traceLabel = sanitizeAiText(input.traceLabel || 'Step 3 treatment suggestion', { maxChars: 120 }) || 'Step 3 treatment suggestion';
  if (!hasMeaningfulTreatmentRequest(input) || !hasMeaningfulTreatmentBaseline(input)) {
    return buildManualTreatmentSuggestionResult(input, { traceLabel });
  }
  const config = getCompassProviderConfig();
  if (!config.proxyConfigured) {
    return buildFallbackTreatmentSuggestionResult(input, {
      aiUnavailable: true,
      traceLabel,
      fallbackReason: classifyTreatmentFallbackReason(new Error('Hosted AI proxy is not configured.'))
    });
  }

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
      timeoutMs: TREATMENT_SUGGESTION_TIMEOUTS.liveMs,
      priorMessages: Array.isArray(input?.priorMessages) ? input.priorMessages : []
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, outputSchema, {
      taskName: 'repairSuggestTreatmentImprovement',
      timeoutMs: TREATMENT_SUGGESTION_TIMEOUTS.repairMs
    });
    const candidate = normaliseTreatmentSuggestionCandidate(parsed?.parsed || {}, () => buildTreatmentImprovementStub(input), input);
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
    return buildFallbackFromError({
      error,
      classifyFallbackReason: classifyTreatmentFallbackReason,
      buildFallbackResult: ({ aiUnavailable, fallbackReason, normalisedError }) => {
        console.warn('buildTreatmentSuggestionWorkflow server fallback:', normalisedError.message);
        return buildFallbackTreatmentSuggestionResult(input, {
          aiUnavailable,
          traceLabel,
          fallbackReason
        });
      }
    });
  }
}

module.exports = {
  buildTreatmentSuggestionWorkflow,
  normaliseTreatmentSuggestionInput
};
