'use strict';

const { buildTraceEntry, normaliseAiError } = require('./_aiOrchestrator');

function normaliseTimeoutValue(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.max(1000, Math.round(parsed));
}

function buildWorkflowTimeoutProfile({
  liveMs = 30000,
  repairMs = 10000,
  qualityMs = null,
  qualityRepairMs = null
} = {}) {
  return {
    liveMs: normaliseTimeoutValue(liveMs, 30000),
    repairMs: normaliseTimeoutValue(repairMs, 10000),
    qualityMs: qualityMs == null ? null : normaliseTimeoutValue(qualityMs, 12000),
    qualityRepairMs: qualityRepairMs == null ? null : normaliseTimeoutValue(qualityRepairMs, 8000)
  };
}

function applyEvidenceMeta(result, evidenceMeta, withEvidenceMeta) {
  return typeof withEvidenceMeta === 'function'
    ? withEvidenceMeta(result, evidenceMeta || null)
    : result;
}

function buildManualModeResult({
  baseResult = {},
  manualReason = null,
  traceLabel = '',
  promptSummary = '',
  response = '',
  sources = [],
  evidenceMeta = null,
  withEvidenceMeta = null
} = {}) {
  return applyEvidenceMeta({
    mode: 'manual',
    ...baseResult,
    usedFallback: false,
    aiUnavailable: false,
    manualReasonCode: manualReason?.code || 'manual_review_required',
    manualReasonTitle: manualReason?.title || 'Manual review only',
    manualReasonMessage: manualReason?.message || '',
    trace: buildTraceEntry({
      label: traceLabel,
      promptSummary,
      response,
      sources
    })
  }, evidenceMeta, withEvidenceMeta);
}

function buildDeterministicFallbackResult({
  baseResult = {},
  fallbackReason = null,
  aiUnavailable = false,
  traceLabel = '',
  promptSummary = '',
  response = '',
  sources = [],
  evidenceMeta = null,
  withEvidenceMeta = null,
  includeReasonFields = true
} = {}) {
  const reasonFields = includeReasonFields
    ? {
        fallbackReasonCode: fallbackReason?.code || 'server_fallback',
        fallbackReasonTitle: fallbackReason?.title || 'Deterministic fallback loaded',
        fallbackReasonMessage: fallbackReason?.message || '',
        fallbackReasonDetail: fallbackReason?.detail || ''
      }
    : {};
  return applyEvidenceMeta({
    mode: 'deterministic_fallback',
    ...baseResult,
    usedFallback: true,
    aiUnavailable: Boolean(aiUnavailable),
    ...reasonFields,
    trace: buildTraceEntry({
      label: traceLabel,
      promptSummary,
      response,
      sources
    })
  }, evidenceMeta, withEvidenceMeta);
}

function buildFallbackFromError({
  error = null,
  classifyFallbackReason = null,
  buildFallbackResult,
  fallbackOptions = {}
} = {}) {
  const normalisedError = normaliseAiError(error);
  const fallbackReason = typeof classifyFallbackReason === 'function'
    ? classifyFallbackReason(normalisedError)
    : null;
  const aiUnavailable = fallbackReason
    ? !/invalid_ai_output|unexpected_response_shape/i.test(String(fallbackReason.code || ''))
    : true;
  return buildFallbackResult({
    ...fallbackOptions,
    aiUnavailable,
    fallbackReason,
    normalisedError
  });
}

module.exports = {
  buildDeterministicFallbackResult,
  buildFallbackFromError,
  buildManualModeResult,
  buildWorkflowTimeoutProfile
};
