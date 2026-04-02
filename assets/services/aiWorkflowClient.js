const AiWorkflowClient = (() => {
  function buildWorkflowUrl(baseUrl, path, {
    defaultBaseUrl = '',
    isDirectCompassUrl = null,
    disableWhenDirect = false
  } = {}) {
    const resolvedDefaultBaseUrl = String(defaultBaseUrl || '').trim();
    const rawBaseUrl = String(baseUrl || resolvedDefaultBaseUrl).trim() || resolvedDefaultBaseUrl;
    if (!rawBaseUrl) return '';
    if (disableWhenDirect && typeof isDirectCompassUrl === 'function' && isDirectCompassUrl(rawBaseUrl)) {
      return '';
    }
    const effectiveBaseUrl = (typeof isDirectCompassUrl === 'function' && isDirectCompassUrl(rawBaseUrl))
      ? resolvedDefaultBaseUrl
      : rawBaseUrl;
    try {
      const url = new URL(effectiveBaseUrl);
      if (url.pathname.endsWith('/api/compass')) {
        url.pathname = url.pathname.replace(/\/api\/compass$/, path);
        url.search = '';
        return url.toString();
      }
      return new URL(path, resolvedDefaultBaseUrl || effectiveBaseUrl).toString();
    } catch {
      return '';
    }
  }

  function createClient({
    defaultBaseUrl = '',
    getBaseUrl,
    isDirectCompassUrl,
    getSessionToken,
    normaliseError,
    storeTraceEntry
  } = {}) {
    function currentBaseUrl() {
      return typeof getBaseUrl === 'function'
        ? String(getBaseUrl() || '').trim()
        : String(defaultBaseUrl || '').trim();
    }

    function buildUrl(path, options = {}) {
      return buildWorkflowUrl(currentBaseUrl(), path, {
        defaultBaseUrl,
        isDirectCompassUrl,
        ...options
      });
    }

    async function postWorkflow(endpoint, payload, { nullOnError = false } = {}) {
      if (!endpoint) {
        if (nullOnError) return null;
        throw new Error('AI workflow endpoint is unavailable.');
      }
      const sessionToken = typeof getSessionToken === 'function' ? String(getSessionToken() || '') : '';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { 'x-session-token': sessionToken } : {})
        },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        const text = await response.text();
        if (nullOnError) return null;
        const error = new Error(`LLM API error ${response.status}: ${text}`);
        const normalised = typeof normaliseError === 'function' ? normaliseError(error) : error;
        throw Object.assign(new Error(normalised?.message || text || 'AI request failed'), {
          code: 'LLM_UNAVAILABLE',
          retriable: true
        });
      }
      const result = await response.json();
      if (result?.trace && typeof result.trace === 'object' && typeof storeTraceEntry === 'function') {
        storeTraceEntry(result.trace);
      }
      return result;
    }

    return {
      getCompanyContextUrl() {
        return buildUrl('/api/company-context', { disableWhenDirect: true });
      },
      getScenarioDraftUrl() {
        return buildUrl('/api/ai/scenario-draft');
      },
      getRegisterAnalysisUrl() {
        return buildUrl('/api/ai/register-analysis');
      },
      getTreatmentSuggestionUrl() {
        return buildUrl('/api/ai/treatment-suggestion');
      },
      getReviewerBriefUrl() {
        return buildUrl('/api/ai/reviewer-brief');
      },
      getChallengeAssessmentUrl() {
        return buildUrl('/api/ai/challenge-assessment');
      },
      getParameterChallengeUrl() {
        return buildUrl('/api/ai/parameter-challenge');
      },
      getChallengeSynthesisUrl() {
        return buildUrl('/api/ai/challenge-synthesis');
      },
      getConsensusRecommendationUrl() {
        return buildUrl('/api/ai/consensus-recommendation');
      },
      getReviewMediationUrl() {
        return buildUrl('/api/ai/review-mediation');
      },
      getStatusUrl() {
        return buildUrl('/api/ai/status');
      },
      postWorkflow
    };
  }

  return {
    createClient
  };
})();
