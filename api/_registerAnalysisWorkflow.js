'use strict';

const { getCompassProviderConfig } = require('./_aiRuntime');
const { buildTraceEntry, callAi, normaliseAiError, parseOrRepairStructuredJson, runStructuredQualityGate, sanitizeAiText } = require('./_aiOrchestrator');
const { workflowUtils } = require('./_scenarioDraftWorkflow');

const {
  buildContextPromptBlock,
  buildEvidenceMeta,
  cleanUserFacingText,
  normaliseGuidance,
  normaliseRiskCards,
  truncateText,
  withEvidenceMeta
} = workflowUtils;

function normaliseBenchmarkBasis(value = '') {
  return cleanUserFacingText(value, { maxSentences: 3 });
}

function classifyRegisterFallbackReason(error = null) {
  const message = String(error?.message || error || '').trim();
  const safeMessage = sanitizeAiText(message, { maxChars: 220 });
  const withDetail = (base, detail) => ({
    ...base,
    detail: String(detail || '').trim()
  });
  if (!safeMessage) {
    return withDetail({
      code: 'no_ai_response',
      title: 'Fallback register analysis loaded',
      message: 'The server did not receive a usable AI response, so it used deterministic register extraction instead.'
    }, 'No response content was returned.');
  }
  if (/Hosted AI proxy is not configured|Missing COMPASS_API_KEY secret/i.test(safeMessage)) {
    return withDetail({
      code: 'proxy_missing_secret',
      title: 'Fallback register analysis loaded',
      message: 'The hosted AI proxy is not configured, so the server used deterministic register extraction instead.'
    }, 'The proxy is missing its Compass configuration.');
  }
  if (/timed out|could not be reached|NetworkError|Failed to fetch|rate limited/i.test(safeMessage)) {
    return withDetail({
      code: 'proxy_unreachable',
      title: 'Fallback register analysis loaded',
      message: 'The hosted AI service could not be reached, so the server used deterministic register extraction instead.'
    }, safeMessage);
  }
  if (/rejected the request|401|403/i.test(safeMessage)) {
    return withDetail({
      code: 'ai_access_rejected',
      title: 'Fallback register analysis loaded',
      message: 'The AI service rejected the request, so the server used deterministic register extraction instead.'
    }, safeMessage);
  }
  if (/Unexpected token|JSON|schema|parse|response shape was not usable|unusable structured response/i.test(safeMessage)) {
    return withDetail({
      code: 'invalid_ai_output',
      title: 'Fallback register analysis loaded',
      message: 'The AI service returned an unusable structured response, so the server used deterministic register extraction instead.'
    }, safeMessage);
  }
  return withDetail({
    code: 'ai_runtime_error',
    title: 'Fallback register analysis loaded',
    message: 'The AI register-analysis step failed at runtime, so the server used deterministic register extraction instead.'
  }, safeMessage);
}

function extractRegisterLines(registerText = '') {
  const lines = String(registerText || '')
    .split(/\r?\n|;/)
    .map((line) => String(line || '').replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 10);
  const noisePattern = /^(risk register|risk title|title|description|owner|status|impact|likelihood|inherent risk|residual risk|mitigation|control owner|action owner|due date|notes?)$/i;
  return lines
    .filter((line) => !noisePattern.test(line))
    .slice(0, 20);
}

function normaliseRegisterAnalysisCandidate(parsed = {}, input = {}) {
  const risks = normaliseRiskCards((Array.isArray(parsed.risks) ? parsed.risks : []).map((risk) => ({
    ...risk,
    regulations: Array.from(new Set([
      ...(Array.isArray(risk?.regulations) ? risk.regulations : []),
      ...(Array.isArray(input.applicableRegulations) ? input.applicableRegulations : [])
    ].map(String).filter(Boolean)))
  }))).map((risk, index) => ({
    id: risk.id || `register-risk-${index + 1}`,
    title: risk.title,
    category: risk.category || 'Register',
    description: risk.description || 'Imported from the uploaded register for review.',
    confidence: risk.confidence || 'medium',
    source: risk.source || 'register',
    regulations: risk.regulations || []
  }));
  return {
    summary: cleanUserFacingText(parsed.summary || '', { maxSentences: 3 }),
    linkAnalysis: cleanUserFacingText(parsed.linkAnalysis || '', { maxSentences: 3 }),
    workflowGuidance: normaliseGuidance(parsed.workflowGuidance),
    benchmarkBasis: normaliseBenchmarkBasis(parsed.benchmarkBasis || ''),
    risks
  };
}

function toRegisterAnalysisQualityCandidate(candidate = {}) {
  return {
    summary: candidate.summary || '',
    linkAnalysis: candidate.linkAnalysis || '',
    workflowGuidance: Array.isArray(candidate.workflowGuidance) ? candidate.workflowGuidance : [],
    benchmarkBasis: candidate.benchmarkBasis || '',
    risks: Array.isArray(candidate.risks) ? candidate.risks.map((risk) => ({
      title: risk.title || '',
      category: risk.category || '',
      description: risk.description || '',
      confidence: risk.confidence || 'medium',
      regulations: Array.isArray(risk.regulations) ? risk.regulations : []
    })) : []
  };
}

function buildFallbackRegisterResult(input = {}, { aiUnavailable = false, fallbackReason = null, traceLabel = 'Step 1 register analysis' } = {}) {
  const evidenceMeta = buildEvidenceMeta({
    citations: input.citations || [],
    businessUnit: input.businessUnit,
    geography: input.geography,
    applicableRegulations: input.applicableRegulations,
    uploadedText: input.registerText,
    registerText: input.registerText,
    userProfile: input.adminSettings?.userProfileSummary,
    organisationContext: input.adminSettings?.companyStructureContext,
    adminSettings: input.adminSettings
  });
  const lines = extractRegisterLines(input.registerText || '');
  const risks = lines.slice(0, 15).map((line, index) => ({
    id: `register-risk-${index + 1}`,
    title: line.replace(/^[-*]\s*/, ''),
    category: 'Register',
    description: 'Imported from the uploaded risk register.',
    confidence: 'medium',
    source: 'register',
    regulations: (Array.isArray(input.applicableRegulations) ? input.applicableRegulations : []).slice(0, 3)
  }));
  const result = withEvidenceMeta({
    summary: `Analysed ${lines.length} register entr${lines.length === 1 ? 'y' : 'ies'} and extracted ${risks.length} candidate risks.`,
    linkAnalysis: 'The shortlist comes directly from the uploaded register rows and still needs review for duplication, relevance, and any event-linking between the selected risks.',
    workflowGuidance: [
      'Keep the risks that materially change loss, disruption, regulation, or third-party exposure.',
      'Use linked mode when the selected risks could arise from the same underlying event or control failure.',
      'Challenge template noise or duplicate rows before using the shortlist in later steps.'
    ],
    benchmarkBasis: 'This register analysis used deterministic server fallback. Treat the extracted shortlist as a working draft until live AI is available again.',
    risks,
    citations: Array.isArray(input.citations) ? input.citations : [],
    usedFallback: true,
    aiUnavailable,
    fallbackReasonCode: fallbackReason?.code || 'server_register_fallback',
    fallbackReasonTitle: fallbackReason?.title || 'Fallback register analysis loaded',
    fallbackReasonMessage: fallbackReason?.message || 'The server used deterministic register extraction instead of live AI analysis for this upload.',
    fallbackReasonDetail: fallbackReason?.detail || '',
    trace: buildTraceEntry({
      label: traceLabel,
      promptSummary: 'Server deterministic fallback used for Step 1 register analysis.',
      response: risks.map((risk) => risk.title).join('\n'),
      sources: input.citations || []
    })
  }, evidenceMeta);
  return aiUnavailable ? { ...result, aiUnavailable: true } : result;
}

async function buildRegisterAnalysisWorkflow(input = {}) {
  const traceLabel = sanitizeAiText(input.traceLabel || 'Step 1 register analysis', { maxChars: 120 }) || 'Step 1 register analysis';
  const config = getCompassProviderConfig();
  if (!config.proxyConfigured) {
    return buildFallbackRegisterResult(input, {
      aiUnavailable: true,
      fallbackReason: classifyRegisterFallbackReason(new Error('Hosted AI proxy is not configured.')),
      traceLabel
    });
  }

  const evidenceMeta = buildEvidenceMeta({
    citations: input.citations || [],
    businessUnit: input.businessUnit,
    geography: input.geography,
    applicableRegulations: input.applicableRegulations,
    uploadedText: input.registerText,
    registerText: input.registerText,
    userProfile: input.adminSettings?.userProfileSummary,
    organisationContext: input.adminSettings?.companyStructureContext,
    adminSettings: input.adminSettings
  });
  const compactRegisterText = truncateText(input.registerText || '', 5000);
  const compactContextSummary = truncateText(input.businessUnit?.contextSummary || input.businessUnit?.notes || '(none)', 320);
  const compactAdminSummary = truncateText(input.adminSettings?.adminContextSummary || '', 220);
  const compactUserProfile = truncateText(input.adminSettings?.userProfileSummary || '(none)', 220);
  const compactOrgContext = truncateText(input.adminSettings?.companyStructureContext || '(none)', 320);
  const compactLiveContext = truncateText(buildContextPromptBlock(input.adminSettings || {}, input.businessUnit || null), 320);
  const outputSchema = `{
  "summary": "string",
  "linkAnalysis": "string",
  "workflowGuidance": ["string"],
  "benchmarkBasis": "string",
  "risks": [
    { "title": "string", "category": "string", "description": "string", "confidence": "high|medium|low", "regulations": ["string"] }
  ]
}`;
  const systemPrompt = `You are a senior enterprise risk analyst extracting a candidate shortlist from an uploaded risk register.

Return JSON only with this schema:
${outputSchema}

Rules:
- keep the shortlist grounded in the uploaded register rows, sheet names, and column headers
- ignore generic template or instructional text
- deduplicate overlapping risks
- keep risk titles concise and selection-card friendly
- do not invent risks that are not supported by the uploaded material`;
  const userPrompt = `Business unit: ${input.businessUnit?.name || 'Unknown'}
Geography: ${input.geography || 'Unknown'}
BU context summary: ${compactContextSummary}
BU-specific AI guidance: ${input.businessUnit?.aiGuidance || '(none)'}
Applicable regulations: ${(Array.isArray(input.applicableRegulations) ? input.applicableRegulations : []).slice(0, 8).join(', ') || '(none)'}
Register metadata: ${input.registerMeta ? JSON.stringify({
    type: input.registerMeta.type,
    extension: input.registerMeta.extension,
    sheetSelectionMode: input.registerMeta.sheetSelectionMode,
    sheets: input.registerMeta.sheets
  }) : '(none)'}
Benchmark strategy: ${truncateText(input.adminSettings?.benchmarkStrategy || 'Prefer GCC and UAE references where possible, then use best global data with clear explanation.', 180)}
Admin context summary: ${compactAdminSummary || '(none)'}
User profile context:
${compactUserProfile}
Organisation structure context:
${compactOrgContext}
Live scoped context:
${compactLiveContext}

Risk register content:
${compactRegisterText || '(none)'}

Instructions:
- focus on risk rows, sheet names, and column headers; ignore generic instructional template text
- deduplicate overlapping risks
- produce concise risk titles suitable for selection cards
- preserve important contextual detail in the descriptions
- extract up to 8 material risks if the register supports them
- for each risk, include a confidence field of high, medium, or low
- include workflow guidance that tells a non-risk practitioner what to do after extraction

Evidence quality context:
${truncateText(evidenceMeta.promptBlock || '', 240)}`;

  try {
    const generation = await callAi(systemPrompt, userPrompt, {
      taskName: 'analyseRiskRegister',
      temperature: 0.3,
      maxCompletionTokens: 2800,
      maxPromptChars: 9000,
      timeoutMs: 45000,
      priorMessages: Array.isArray(input?.priorMessages) ? input.priorMessages : []
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, outputSchema, {
      taskName: 'repairAnalyseRiskRegister'
    });
    let candidate = normaliseRegisterAnalysisCandidate(parsed?.parsed || {}, input);
    try {
      const qualityChecked = await runStructuredQualityGate({
        taskName: 'analyseRiskRegisterQualityGate',
        schemaHint: outputSchema,
        originalContext: [
          `Business unit: ${input.businessUnit?.name || 'Unknown'}`,
          `Geography: ${input.geography || 'Unknown'}`,
          `Register metadata: ${input.registerMeta ? JSON.stringify({
            type: input.registerMeta.type,
            extension: input.registerMeta.extension,
            sheetSelectionMode: input.registerMeta.sheetSelectionMode,
            sheets: input.registerMeta.sheets
          }) : '(none)'}`,
          `Register text: ${compactRegisterText || '(none)'}`
        ].join('\n'),
        checklist: [
          'Keep the shortlist grounded in the uploaded register rows, sheet names, and column headers.',
          'Do not invent risks that are not supported by the uploaded material.',
          'Remove template or instructional noise.',
          'Keep risk titles concise and selection-card friendly.',
          'Keep the summary and workflow guidance coherent with the extracted shortlist.'
        ],
        candidatePayload: toRegisterAnalysisQualityCandidate(candidate)
      });
      if (qualityChecked?.parsed) {
        candidate = normaliseRegisterAnalysisCandidate(qualityChecked.parsed, input);
      }
    } catch (qualityGateError) {
      console.warn('register analysis quality gate fallback:', qualityGateError.message);
    }

    return withEvidenceMeta({
      ...candidate,
      citations: Array.isArray(input.citations) ? input.citations : [],
      usedFallback: false,
      aiUnavailable: false,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: generation.promptSummary,
        response: [
          candidate.summary,
          candidate.linkAnalysis,
          ...(Array.isArray(candidate.risks) ? candidate.risks.map((risk) => risk.title) : [])
        ].filter(Boolean).join('\n'),
        sources: input.citations || []
      })
    }, evidenceMeta);
  } catch (error) {
    const normalisedError = normaliseAiError(error);
    const fallbackReason = classifyRegisterFallbackReason(normalisedError);
    const aiUnavailable = !/invalid_ai_output|unexpected_response_shape/i.test(String(fallbackReason.code || ''));
    console.warn('buildRegisterAnalysisWorkflow server fallback:', normalisedError.message);
    return buildFallbackRegisterResult(input, {
      aiUnavailable,
      fallbackReason,
      traceLabel
    });
  }
}

module.exports = {
  buildRegisterAnalysisWorkflow
};
