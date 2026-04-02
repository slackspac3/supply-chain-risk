'use strict';

const DEFAULT_COMPASS_API_URL = 'https://api.core42.ai/v1/chat/completions';
const DEFAULT_COMPASS_MODEL = 'gpt-5.1';
const AI_STATUS_TIMEOUT_MS = 8000;

function getCompassProviderConfig() {
  const apiUrl = String(process.env.COMPASS_API_URL || DEFAULT_COMPASS_API_URL).trim() || DEFAULT_COMPASS_API_URL;
  const model = String(process.env.COMPASS_MODEL || DEFAULT_COMPASS_MODEL).trim() || DEFAULT_COMPASS_MODEL;
  const apiKey = String(process.env.COMPASS_API_KEY || '').trim();
  return {
    apiUrl,
    model,
    apiKey,
    proxyConfigured: !!(apiUrl && apiKey)
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = AI_STATUS_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeCompassProvider(config = getCompassProviderConfig()) {
  const response = await fetchWithTimeout(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      max_completion_tokens: 16,
      temperature: 0,
      messages: [
        { role: 'system', content: 'You are a connectivity check. Reply with valid JSON only.' },
        { role: 'user', content: 'Return exactly this JSON and nothing else: {"status":"ok"}' }
      ]
    })
  }, AI_STATUS_TIMEOUT_MS);

  return response;
}

async function evaluateAiRuntimeStatus({ probe = true } = {}) {
  const config = getCompassProviderConfig();
  const checkedAt = Date.now();

  if (!config.proxyConfigured) {
    return {
      mode: 'deterministic_fallback',
      providerReachable: false,
      model: config.model,
      proxyConfigured: false,
      checkedAt,
      message: 'Hosted AI proxy is not configured. Supported workflows may continue with deterministic fallback or manual handling.'
    };
  }

  if (!probe) {
    return {
      mode: 'degraded',
      providerReachable: false,
      model: config.model,
      proxyConfigured: true,
      checkedAt,
      message: 'Hosted AI proxy is configured. Run a live status check to confirm provider reachability.'
    };
  }

  try {
    const response = await probeCompassProvider(config);
    if (response.ok) {
      return {
        mode: 'live',
        providerReachable: true,
        model: config.model,
        proxyConfigured: true,
        checkedAt,
        message: 'Hosted AI proxy is configured and the provider responded to a server-side health check.'
      };
    }

    if (response.status === 401 || response.status === 403) {
      return {
        mode: 'blocked',
        providerReachable: false,
        model: config.model,
        proxyConfigured: true,
        checkedAt,
        message: 'Hosted AI proxy is configured, but the provider rejected the server-side health check.'
      };
    }

    return {
      mode: 'degraded',
      providerReachable: false,
      model: config.model,
      proxyConfigured: true,
      checkedAt,
      message: 'Hosted AI proxy is configured, but the provider could not complete the server-side health check right now.'
    };
  } catch (error) {
    if (error?.name === 'AbortError') {
      return {
        mode: 'degraded',
        providerReachable: false,
        model: config.model,
        proxyConfigured: true,
        checkedAt,
        message: 'Hosted AI proxy is configured, but the server-side health check timed out.'
      };
    }
    console.error('api/_aiRuntime.evaluateAiRuntimeStatus failed:', error);
    return {
      mode: 'degraded',
      providerReachable: false,
      model: config.model,
      proxyConfigured: true,
      checkedAt,
      message: 'Hosted AI proxy is configured, but the provider could not be reached for a server-side health check.'
    };
  }
}

module.exports = {
  DEFAULT_COMPASS_API_URL,
  DEFAULT_COMPASS_MODEL,
  getCompassProviderConfig,
  evaluateAiRuntimeStatus
};
