'use strict';

const SUMMARY_LOG_INTERVAL = 25;

const routeMetrics = new Map();

function createEmptyRouteMetrics(route = '') {
  return {
    route: String(route || '').trim(),
    invocationCount: 0,
    completedCount: 0,
    totalLatencyMs: 0,
    averageLatencyMs: 0,
    timeoutCount: 0,
    deterministicFallbackCount: 0,
    manualCount: 0,
    duplicateSuppressionCount: 0,
    cacheHitCount: 0,
    lastUpdatedAt: 0
  };
}

function getRouteMetricsEntry(route = '') {
  const key = String(route || '').trim();
  if (!routeMetrics.has(key)) {
    routeMetrics.set(key, createEmptyRouteMetrics(key));
  }
  return routeMetrics.get(key);
}

function cloneRouteMetrics(metrics = {}) {
  return {
    route: String(metrics.route || '').trim(),
    invocationCount: Number(metrics.invocationCount || 0),
    averageLatencyMs: Number(metrics.averageLatencyMs || 0),
    timeoutCount: Number(metrics.timeoutCount || 0),
    deterministicFallbackCount: Number(metrics.deterministicFallbackCount || 0),
    manualCount: Number(metrics.manualCount || 0),
    duplicateSuppressionCount: Number(metrics.duplicateSuppressionCount || 0),
    cacheHitCount: Number(metrics.cacheHitCount || 0),
    lastUpdatedAt: Number(metrics.lastUpdatedAt || 0)
  };
}

function emitRouteMetricsSummary(route = '', reason = 'periodic') {
  const metrics = routeMetrics.get(String(route || '').trim());
  if (!metrics) return;
  console.info('[ai-route-metrics]', JSON.stringify({
    reason: String(reason || 'periodic'),
    route: metrics.route,
    invocationCount: metrics.invocationCount,
    averageLatencyMs: metrics.averageLatencyMs,
    timeoutCount: metrics.timeoutCount,
    deterministicFallbackCount: metrics.deterministicFallbackCount,
    manualCount: metrics.manualCount,
    duplicateSuppressionCount: metrics.duplicateSuppressionCount,
    cacheHitCount: metrics.cacheHitCount
  }));
}

function isTimeoutSignal({ result = null, error = null } = {}) {
  const candidateTexts = [
    error?.message,
    result?.fallbackReasonCode,
    result?.fallbackReasonMessage,
    result?.fallbackReasonDetail,
    result?.manualReasonCode,
    result?.manualReasonMessage
  ];
  return candidateTexts.some((value) => /timed out|timeout/i.test(String(value || '').trim()));
}

function beginAiRouteMetrics(route = '') {
  const metrics = getRouteMetricsEntry(route);
  metrics.invocationCount += 1;
  metrics.lastUpdatedAt = Date.now();
  return {
    route: metrics.route,
    startedAt: Date.now()
  };
}

function finishAiRouteMetrics(handle = {}, { result = null, error = null } = {}) {
  const route = String(handle.route || '').trim();
  if (!route) return;
  const metrics = getRouteMetricsEntry(route);
  const latencyMs = Math.max(0, Date.now() - Number(handle.startedAt || Date.now()));
  metrics.completedCount += 1;
  metrics.totalLatencyMs += latencyMs;
  metrics.averageLatencyMs = Number((metrics.totalLatencyMs / Math.max(1, metrics.completedCount)).toFixed(1));
  if (String(result?.mode || '') === 'deterministic_fallback') {
    metrics.deterministicFallbackCount += 1;
  }
  if (String(result?.mode || '') === 'manual') {
    metrics.manualCount += 1;
  }
  const timedOut = isTimeoutSignal({ result, error });
  if (timedOut) {
    metrics.timeoutCount += 1;
  }
  metrics.lastUpdatedAt = Date.now();
  if (timedOut) {
    emitRouteMetricsSummary(route, 'timeout');
  } else if (metrics.invocationCount % SUMMARY_LOG_INTERVAL === 0) {
    emitRouteMetricsSummary(route, 'periodic');
  }
}

async function withAiRouteMetrics(route = '', execute) {
  const handle = beginAiRouteMetrics(route);
  try {
    const result = await Promise.resolve().then(() => execute());
    finishAiRouteMetrics(handle, { result });
    return result;
  } catch (error) {
    finishAiRouteMetrics(handle, { error });
    throw error;
  }
}

function recordAiRouteReuse(route = '', event = {}) {
  const metrics = getRouteMetricsEntry(route);
  const type = String(event?.type || '').trim().toLowerCase();
  if (type === 'cache_hit') metrics.cacheHitCount += 1;
  if (type === 'inflight_reuse') metrics.duplicateSuppressionCount += 1;
  metrics.lastUpdatedAt = Date.now();
}

function getAiRouteMetricsSnapshot(route = '') {
  const requestedRoute = String(route || '').trim();
  if (requestedRoute) {
    return cloneRouteMetrics(getRouteMetricsEntry(requestedRoute));
  }
  return Array.from(routeMetrics.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .reduce((accumulator, [key, value]) => {
      accumulator[key] = cloneRouteMetrics(value);
      return accumulator;
    }, {});
}

function resetAiRouteMetrics() {
  routeMetrics.clear();
}

module.exports = {
  beginAiRouteMetrics,
  finishAiRouteMetrics,
  withAiRouteMetrics,
  recordAiRouteReuse,
  getAiRouteMetricsSnapshot,
  resetAiRouteMetrics
};
