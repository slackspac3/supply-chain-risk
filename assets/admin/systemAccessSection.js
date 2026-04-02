const AdminSystemAccessSection = (() => {
  function escape(value = '') {
    return typeof escapeHtml === 'function' ? escapeHtml(value) : String(value || '');
  }

  function getReadinessModel(serverStatus = null, { localDevMode = false } = {}) {
    const release = typeof getReleaseInfo === 'function' ? getReleaseInfo() : { channel: 'pilot' };
    const pilotChannel = typeof isPilotOrStagingRelease === 'function'
      ? isPilotOrStagingRelease()
      : /^(pilot|staging)$/i.test(String(release?.channel || 'pilot'));
    const status = serverStatus && typeof serverStatus === 'object' ? serverStatus : null;
    const checkedAt = Number(status?.checkedAt || 0);
    const checkedLabel = typeof formatRelativePilotTime === 'function'
      ? formatRelativePilotTime(checkedAt, status ? 'just now' : 'Checking now')
      : (checkedAt ? 'Recently checked' : 'Checking now');
    const activePath = localDevMode
      ? 'Hosted proxy · local dev overrides available'
      : 'Hosted proxy';
    const providerLabel = status
      ? (status.providerReachable ? 'Reachable' : 'Unavailable')
      : 'Checking';
    const base = {
      activePath,
      checkedLabel,
      providerLabel,
      model: String(status?.model || 'gpt-5.1')
    };

    if (!status) {
      return {
        ...base,
        tone: 'neutral',
        badge: 'Checking server status',
        title: 'Server AI status',
        copy: 'System Access now reflects the server-reported AI mode. The browser no longer treats its own session checks as the source of truth.',
        detail: 'Run a refresh if you need a fresh server-side health check right now.'
      };
    }

    if (status.mode === 'live') {
      return {
        ...base,
        tone: 'success',
        badge: 'Live',
        title: 'Server AI status',
        copy: pilotChannel
          ? 'The hosted proxy is in live mode based on a server-side health check. This is the right state for pilot-quality AI use, subject to normal evidence review.'
          : 'The hosted proxy is in live mode based on a server-side health check.',
        detail: String(status.message || '').trim()
      };
    }

    if (status.mode === 'blocked') {
      return {
        ...base,
        tone: 'warning',
        badge: 'Blocked',
        title: 'Server AI status',
        copy: 'The hosted proxy is configured, but the upstream provider rejected the server-side health check. Do not treat AI output as live until this is resolved.',
        detail: String(status.message || '').trim()
      };
    }

    if (status.mode === 'deterministic_fallback') {
      return {
        ...base,
        tone: 'warning',
        badge: 'Deterministic fallback',
        title: 'Server AI status',
        copy: pilotChannel
          ? 'The hosted proxy is not configured for live AI right now. Supported workflows may continue with continuity fallback or manual handling, but this is not pilot sign-off quality.'
          : 'The hosted proxy is not configured for live AI right now.',
        detail: String(status.message || '').trim()
      };
    }

    if (status.mode === 'manual_only') {
      return {
        ...base,
        tone: 'warning',
        badge: 'Manual only',
        title: 'Server AI status',
        copy: 'The platform is currently in manual-only mode. Continue without AI until the hosted path is restored.',
        detail: String(status.message || '').trim()
      };
    }

    return {
      ...base,
      tone: 'warning',
      badge: 'Degraded',
      title: 'Server AI status',
      copy: 'The hosted proxy is configured, but the provider could not complete the server-side health check right now. Treat AI output carefully and avoid sign-off until live mode returns.',
      detail: String(status.message || '').trim()
    };
  }

  function renderPilotAiReadinessCard(serverStatus = null, { localDevMode = false } = {}) {
    const readiness = getReadinessModel(serverStatus, { localDevMode });
    return `<div class="card card--elevated mt-6" id="pilot-ai-readiness-panel">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:var(--sp-3);flex-wrap:wrap">
        <div class="context-panel-title">${escape(readiness.title)}</div>
        <span class="badge badge--${escape(readiness.tone)}">${escape(readiness.badge)}</span>
      </div>
      <div class="context-panel-copy" style="margin-top:var(--sp-2)">${escape(readiness.copy)}</div>
      <div class="grid-4" style="margin-top:var(--sp-4)">
        <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
          <div class="form-help">Active path</div>
          <div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(readiness.activePath)}</div>
        </div>
        <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
          <div class="form-help">Server mode</div>
          <div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(readiness.badge)}</div>
        </div>
        <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
          <div class="form-help">Provider reachability</div>
          <div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(readiness.providerLabel)}</div>
        </div>
        <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
          <div class="form-help">Last checked</div>
          <div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(readiness.checkedLabel)}</div>
        </div>
      </div>
      <div class="grid-2" style="margin-top:var(--sp-4)">
        <div style="background:var(--bg-elevated);padding:var(--sp-4);border-radius:var(--radius-lg)">
          <div class="form-help">Model</div>
          <div style="font-weight:700;color:var(--text-primary);margin-top:4px">${escape(readiness.model)}</div>
        </div>
        <div style="display:flex;align-items:end;justify-content:flex-end">
          <button class="btn btn--secondary" id="btn-refresh-ai-status">Refresh server status</button>
        </div>
      </div>
      ${readiness.detail ? `<div class="form-help" style="margin-top:var(--sp-4)">${escape(readiness.detail)}</div>` : ''}
    </div>`;
  }

  function refreshPilotAiReadinessPanel(serverStatus = null) {
    const panel = document.getElementById('pilot-ai-readiness-panel');
    if (!panel) return;
    const localDevMode = typeof LLMService !== 'undefined'
      && LLMService
      && typeof LLMService.isLocalDevRuntimeConfigAllowed === 'function'
      && LLMService.isLocalDevRuntimeConfigAllowed();
    const status = serverStatus
      || (typeof LLMService !== 'undefined'
        && LLMService
        && typeof LLMService.getCachedServerAiStatus === 'function'
        ? LLMService.getCachedServerAiStatus()
        : null);
    panel.outerHTML = renderPilotAiReadinessCard(status, { localDevMode });
  }

  function renderLocalDevOverrides(sessionLLM = {}) {
    return `<div class="card card--elevated mt-6">
      <div class="context-panel-title">Local development overrides</div>
      <div class="context-panel-copy" style="margin-top:var(--sp-2)">These controls exist only on localhost for debugging. They do not change the server-reported AI mode used for pilot or production decisions.</div>
      <div class="grid-2 mt-4">
        <div class="form-group">
          <label class="form-label" for="admin-compass-url">Compass URL</label>
          <input class="form-input" id="admin-compass-url" value="${escape(sessionLLM.apiUrl || DEFAULT_COMPASS_PROXY_URL)}">
          <span class="form-help">Keep <code>${escape(DEFAULT_COMPASS_PROXY_URL)}</code> for the hosted proxy path, or use a direct endpoint only while debugging locally.</span>
        </div>
        <div class="form-group">
          <label class="form-label" for="admin-compass-model">Model</label>
          <input class="form-input" id="admin-compass-model" value="${escape(sessionLLM.model || 'gpt-5.1')}">
        </div>
      </div>
      <div class="form-group mt-4">
        <label class="form-label" for="admin-compass-key">Compass API Key</label>
        <input class="form-input" id="admin-compass-key" type="password" value="${escape(sessionLLM.apiKey || '')}" placeholder="Paste key for local development only">
        <span class="form-help">Ignored outside localhost. Use the hosted proxy for pilot or production paths.</span>
      </div>
      <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
        <button class="btn btn--secondary" id="btn-test-session-llm">Test local override</button>
        <details class="results-actions-disclosure admin-footer-overflow">
          <summary class="btn btn--ghost btn--sm">Local override controls</summary>
          <div class="results-actions-disclosure-menu">
            <button class="btn btn--secondary btn--sm" id="btn-save-session-llm">Save local override</button>
            <button class="btn btn--secondary btn--sm" id="btn-clear-session-llm">Clear local override</button>
          </div>
        </details>
        <span class="form-help">Stored only on this local development browser until you clear it.</span>
      </div>
    </div>`;
  }

  function renderSection({ localDevMode = false, sessionLLM = {}, serverStatus = null }) {
    const release = getReleaseInfo();
    const description = localDevMode
      ? 'System Access shows the server-reported AI mode first. Localhost-only overrides stay available below for temporary debugging.'
      : 'System Access shows the server-reported hosted AI mode. Pilot and production builds use the hosted proxy only.';
    return renderSettingsSection({
      title: 'System Access',
      scope: 'admin-settings',
      description,
      meta: serverStatus?.model || 'Hosted proxy',
      body: `${localDevMode ? renderLocalDevOverrides(sessionLLM) : `<div class="card card--elevated mt-6">
        <div class="context-panel-title">Hosted proxy only</div>
        <div class="context-panel-copy" style="margin-top:var(--sp-2)">Browser-direct AI configuration is disabled outside explicit local development. Use the server-reported status below when checking pilot or production readiness.</div>
      </div>`}
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
      ${renderPilotAiReadinessCard(serverStatus, { localDevMode })}`
    });
  }

  function bind({ rerenderCurrentAdminSection }) {
    const localDevMode = typeof LLMService !== 'undefined'
      && LLMService
      && typeof LLMService.isLocalDevRuntimeConfigAllowed === 'function'
      && LLMService.isLocalDevRuntimeConfigAllowed();

    function bindRefreshButton() {
      const button = document.getElementById('btn-refresh-ai-status');
      if (!button || button.dataset.bound === 'true') return;
      button.dataset.bound = 'true';
      button.addEventListener('click', () => {
        refreshServerStatus({ force: true, silent: false });
      });
    }

    async function refreshServerStatus({ force = true, silent = false } = {}) {
      const btn = document.getElementById('btn-refresh-ai-status');
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Refreshing…';
      }
      try {
        const status = await LLMService.fetchServerAiStatus({ force, probe: true });
        refreshPilotAiReadinessPanel(status);
        bindRefreshButton();
        if (!silent) {
          const tone = status.mode === 'live' ? 'success' : 'warning';
          UI.toast(status.message || 'Server AI status refreshed.', tone, 5000);
        }
      } catch (error) {
        if (!silent) {
          UI.toast('Server AI status could not be refreshed right now.', 'danger', 7000);
        }
      } finally {
        const refreshedBtn = document.getElementById('btn-refresh-ai-status');
        if (refreshedBtn) {
          refreshedBtn.disabled = false;
          refreshedBtn.textContent = 'Refresh server status';
        }
      }
    }

    bindRefreshButton();

    if (localDevMode) {
      document.getElementById('btn-save-session-llm')?.addEventListener('click', () => {
        const config = getAdminLLMConfig();
        saveSessionLLMConfig(config);
        if (typeof clearPilotAiExpectationWarning === 'function') clearPilotAiExpectationWarning();
        LLMService.setCompassConfig(config);
        UI.toast(config.apiKey ? 'Local dev AI override saved for this browser.' : 'Local dev proxy override saved for this browser.', 'success');
      });

      document.getElementById('btn-test-session-llm')?.addEventListener('click', async () => {
        const btn = document.getElementById('btn-test-session-llm');
        const config = getAdminLLMConfig();
        btn.disabled = true;
        btn.textContent = 'Testing…';
        try {
          LLMService.setCompassConfig(config);
          const result = await LLMService.testCompassConnection();
          UI.toast(result.message || 'Local dev AI override responded successfully.', 'success', 5000);
        } catch (error) {
          UI.toast(String(error?.message || 'Local dev AI override could not be confirmed right now.'), 'danger', 7000);
        } finally {
          btn.disabled = false;
          btn.textContent = 'Test local override';
        }
      });

      document.getElementById('btn-clear-session-llm')?.addEventListener('click', () => {
        saveSessionLLMConfig({});
        if (typeof clearPilotAiExpectationWarning === 'function') clearPilotAiExpectationWarning();
        LLMService.clearCompassConfig();
        rerenderCurrentAdminSection();
        UI.toast('Local dev AI override cleared.', 'success');
      });
    }

    refreshServerStatus({ force: false, silent: true });
  }

  return { renderSection, bind };
})();
