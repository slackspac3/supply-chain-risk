const AdminSystemAccessSection = (() => {
  function escape(value = '') {
    return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value || '');
  }

  function getReadinessModel(runtimeStatus = null) {
    const release = typeof getReleaseInfo === 'function' ? getReleaseInfo() : { channel: 'pilot' };
    const pilotChannel = typeof isPilotOrStagingRelease === 'function'
      ? isPilotOrStagingRelease()
      : /^(pilot|staging)$/i.test(String(release?.channel || 'pilot'));
    const runtime = runtimeStatus && typeof runtimeStatus === 'object'
      ? runtimeStatus
      : (typeof LLMService !== 'undefined' && LLMService && typeof LLMService.getRuntimeStatus === 'function'
          ? LLMService.getRuntimeStatus()
          : {
              apiUrl: DEFAULT_COMPASS_PROXY_URL,
              model: 'gpt-5.1',
              hasApiKey: false,
              usingDirectCompass: false,
              usingProxy: true,
              usingStub: false,
              configFingerprint: `${DEFAULT_COMPASS_PROXY_URL}::gpt-5.1::keyless`
            });
    const health = typeof getSessionLLMHealth === 'function' ? getSessionLLMHealth() : null;
    const matchesActiveRuntime = !!(health?.configFingerprint && health.configFingerprint === runtime.configFingerprint);
    const checkedAt = Number(matchesActiveRuntime ? health?.checkedAt : 0);
    const checkedLabel = typeof formatRelativePilotTime === 'function'
      ? formatRelativePilotTime(checkedAt, 'Not yet checked')
      : (checkedAt ? 'Recently checked' : 'Not yet checked');
    const activePath = runtime.usingStub
      ? 'Local fallback'
      : runtime.usingProxy
        ? 'Hosted proxy'
        : runtime.usingDirectCompass
          ? 'Direct Compass'
          : 'Unknown';

    if (runtime.usingStub) {
      return {
        tone: 'warning',
        badge: 'Local fallback active',
        title: pilotChannel ? 'Live AI required for pilot sign-off' : 'Live AI not configured',
        copy: pilotChannel
          ? 'This browser session is currently using local fallback guidance because live AI is not configured. Do not treat AI outputs as pilot-quality until a live connection is verified here.'
          : 'This browser session is currently using local fallback guidance because live AI is not configured.',
        activePath,
        checkedLabel,
        detail: 'Use the hosted proxy or add a temporary browser key for direct testing, then run Test Connection.'
      };
    }

    if (matchesActiveRuntime && health?.status === 'live_ok') {
      return {
        tone: 'success',
        badge: 'Live AI verified',
        title: 'Pilot AI readiness',
        copy: pilotChannel
          ? 'This active runtime was verified against the live AI path in this browser session. Pilot-quality AI checks can rely on this path, subject to normal evidence review.'
          : 'This active runtime was verified against the live AI path in this browser session.',
        activePath,
        checkedLabel,
        detail: String(health?.message || '').trim()
      };
    }

    if (matchesActiveRuntime && health?.status === 'live_error') {
      return {
        tone: 'warning',
        badge: 'Verification failed',
        title: 'Pilot AI readiness',
        copy: pilotChannel
          ? 'The active runtime is configured, but the last live connection check failed. Retry Test Connection before using AI outputs for pilot sign-off.'
          : 'The active runtime is configured, but the last live connection check failed.',
        activePath,
        checkedLabel,
        detail: String(health?.message || '').trim()
      };
    }

    return {
      tone: pilotChannel ? 'warning' : 'neutral',
      badge: 'Not yet verified',
      title: 'Pilot AI readiness',
      copy: pilotChannel
        ? 'The active AI path is configured, but this browser session has not confirmed a live AI connection yet. Use Test Connection before relying on AI quality in pilot or staging.'
        : 'The active AI path is configured, but this browser session has not confirmed a live AI connection yet.',
      activePath,
      checkedLabel,
      detail: runtime.usingProxy
        ? 'The hosted proxy path is preferred for pilot use. Verify it here before sign-off.'
        : 'Verify the current AI path here before sign-off.'
    };
  }

  function renderPilotAiReadinessCard(runtimeStatus = null) {
    const readiness = getReadinessModel(runtimeStatus);
    return `<div class="card card--elevated mt-6" id="pilot-ai-readiness-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);flex-wrap:wrap">
        <div class="context-panel-title">${escape(readiness.title)}</div>
        <span class="badge badge--${escape(readiness.tone)}">${escape(readiness.badge)}</span>
      </div>
      <div class="context-panel-copy" style="margin-top:var(--sp-2)">${escape(readiness.copy)}</div>
      <div class="grid-3" style="margin-top:var(--sp-4)">
        <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
          <div class="form-help">Active path</div>
          <div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(readiness.activePath)}</div>
        </div>
        <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
          <div class="form-help">Verification</div>
          <div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(readiness.badge)}</div>
        </div>
        <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
          <div class="form-help">Last checked</div>
          <div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(readiness.checkedLabel)}</div>
        </div>
      </div>
      ${readiness.detail ? `<div class="form-help" style="margin-top:var(--sp-4)">${escape(readiness.detail)}</div>` : ''}
    </div>`;
  }

  function refreshPilotAiReadinessPanel() {
    const panel = document.getElementById('pilot-ai-readiness-panel');
    if (!panel) return;
    const runtimeStatus = typeof LLMService !== 'undefined' && LLMService && typeof LLMService.getRuntimeStatus === 'function'
      ? LLMService.getRuntimeStatus()
      : null;
    panel.outerHTML = renderPilotAiReadinessCard(runtimeStatus);
  }

  function renderSection({ directCompass, sessionLLM, runtimeStatus = null }) {
    const release = getReleaseInfo();
    const pilotChannel = typeof isPilotOrStagingRelease === 'function' ? isPilotOrStagingRelease() : true;
    const description = directCompass
      ? 'Direct Compass is selected for temporary browser testing only. For pilot or staging sign-off, verify a live connection below or prefer the hosted proxy path.'
      : (pilotChannel
          ? 'The hosted proxy path is active. Leave the browser key blank and verify live AI below before pilot or staging sign-off.'
          : 'A hosted proxy URL is configured. Leave the browser key blank and test through the proxy.');
    return renderSettingsSection({
      title: 'System Access',
      scope: 'admin-settings',
      description,
      meta: sessionLLM.model || 'gpt-5.1',
      body: `<div class="grid-2">
        <div class="form-group">
          <label class="form-label" for="admin-compass-url">Compass URL</label>
          <input class="form-input" id="admin-compass-url" value="${sessionLLM.apiUrl || DEFAULT_COMPASS_PROXY_URL}">
          <span class="form-help">Use <code>${DEFAULT_COMPASS_PROXY_URL}</code> for the hosted proxy path.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-compass-model">Model</label>
          <input class="form-input" id="admin-compass-model" value="${sessionLLM.model || 'gpt-5.1'}">
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="admin-compass-key">Compass API Key</label>
        <input class="form-input" id="admin-compass-key" type="password" value="${sessionLLM.apiKey || ''}" placeholder="Paste key for this browser session">
        <span class="form-help">Leave blank when using the hosted proxy. Only use a browser key for temporary direct testing.</span>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-test-session-llm">Test Connection</button>
        <details class="results-actions-disclosure admin-footer-overflow">
          <summary class="btn btn--ghost btn--sm">Direct testing overrides</summary>
          <div class="results-actions-disclosure-menu">
            <button class="btn btn--secondary btn--sm" id="btn-save-session-llm">Save Session Key</button>
            <button class="btn btn--secondary btn--sm" id="btn-clear-session-llm">Clear Session Key</button>
          </div>
        </details>
        <span class="form-help">Stored in this admin browser for the PoC until you clear it.</span>
      </div>
      <div class="card card--elevated mt-6">
        <div class="context-panel-title">Pilot release diagnostics</div>
        <div class="context-panel-copy" style="margin-top:var(--sp-2)">Use this stamp to confirm which pilot build is live before sign-off, smoke checks, or rollback.</div>
        <div class="grid-3" style="margin-top:var(--sp-4)">
          <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div class="form-help">Version</div><div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(String(release.version || '0.0.0'))}</div></div>
          <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div class="form-help">Channel</div><div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(String(release.channel || 'pilot'))}</div></div>
          <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)"><div class="form-help">Build</div><div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(String(release.build || 'unknown'))}</div></div>
        </div>
        <div class="form-help" style="margin-top:var(--sp-4)">Asset version ${escape(String(release.assetVersion || APP_ASSET_VERSION))} · See <code>RELEASE_CHECKLIST.md</code> and <code>ROLLBACK_PLAYBOOK.md</code> before pilot release changes.</div>
      </div>
      ${renderPilotAiReadinessCard(runtimeStatus)}`
    });
  }

  function bind({ rerenderCurrentAdminSection }) {
    document.getElementById('btn-save-session-llm')?.addEventListener('click', () => {
      const config = getAdminLLMConfig();
      saveSessionLLMConfig(config);
      if (typeof clearSessionLLMHealth === 'function') clearSessionLLMHealth();
      if (typeof clearPilotAiExpectationWarning === 'function') clearPilotAiExpectationWarning();
      LLMService.setCompassConfig(config);
      refreshPilotAiReadinessPanel();
      if (typeof maybeWarnPilotAiExpectation === 'function') maybeWarnPilotAiExpectation();
      UI.toast(config.apiKey ? 'Compass session key loaded for this session.' : 'Compass proxy/session settings loaded for this session.', 'success');
    });

    document.getElementById('btn-test-session-llm')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-test-session-llm');
      const config = getAdminLLMConfig();
      btn.disabled = true;
      btn.textContent = 'Testing…';
      try {
        LLMService.setCompassConfig(config);
        const result = await LLMService.testCompassConnection();
        const runtimeStatus = typeof LLMService.getRuntimeStatus === 'function' ? LLMService.getRuntimeStatus() : null;
        if (typeof saveSessionLLMHealth === 'function') {
          saveSessionLLMHealth({
            status: 'live_ok',
            checkedAt: Date.now(),
            message: result.message || 'Connection successful.',
            configFingerprint: runtimeStatus?.configFingerprint || ''
          });
        }
        refreshPilotAiReadinessPanel();
        UI.toast(
          (typeof isPilotOrStagingRelease === 'function' && isPilotOrStagingRelease())
            ? 'Live AI connection verified for this browser session.'
            : (result.message || 'Compass connection successful.'),
          'success',
          5000
        );
      } catch (error) {
        const runtimeStatus = typeof LLMService.getRuntimeStatus === 'function' ? LLMService.getRuntimeStatus() : null;
        if (typeof saveSessionLLMHealth === 'function') {
          saveSessionLLMHealth({
            status: runtimeStatus?.usingStub ? 'stub_mode' : 'live_error',
            checkedAt: Date.now(),
            message: String(error?.message || 'Compass connection could not be confirmed right now.').trim(),
            configFingerprint: runtimeStatus?.configFingerprint || ''
          });
        }
        if (typeof clearPilotAiExpectationWarning === 'function') clearPilotAiExpectationWarning();
        refreshPilotAiReadinessPanel();
        if (runtimeStatus?.usingStub && typeof isPilotOrStagingRelease === 'function' && isPilotOrStagingRelease()) {
          UI.toast('Live AI is not configured for this browser session. Local fallback guidance remains active.', 'warning', 7000);
        } else {
          UI.toast('Live AI connection could not be confirmed right now. Verify System Access before pilot sign-off.', 'danger', 7000);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = 'Test Connection';
      }
    });

    document.getElementById('btn-clear-session-llm')?.addEventListener('click', () => {
      localStorage.removeItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX));
      sessionStorage.removeItem(buildUserStorageKey(SESSION_LLM_STORAGE_PREFIX));
      if (typeof clearSessionLLMHealth === 'function') clearSessionLLMHealth();
      if (typeof clearPilotAiExpectationWarning === 'function') clearPilotAiExpectationWarning();
      LLMService.clearCompassConfig();
      rerenderCurrentAdminSection();
      UI.toast('Compass browser key cleared.', 'success');
    });
  }

  return { renderSection, bind };
})();
