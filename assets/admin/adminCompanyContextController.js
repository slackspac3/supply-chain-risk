(function(global) {
  'use strict';

  function getCompassConfigFromAdminInputs() {
    return {
      apiUrl: document.getElementById('admin-compass-url')?.value.trim() || DEFAULT_COMPASS_PROXY_URL,
      model: document.getElementById('admin-compass-model')?.value.trim() || AiStatusClient.DEFAULT_MODEL,
      apiKey: document.getElementById('admin-compass-key')?.value.trim() || ''
    };
  }

  function create({ websiteEl, profileEl, regsInput }) {
    const history = [];
    const historyEl = document.getElementById('admin-company-refinement-history');
    const followupEl = document.getElementById('admin-company-followup');
    const statusEl = document.getElementById('admin-company-refine-status');

    function getCurrentSections() {
      return {
        companySummary: document.getElementById('admin-company-section-summary')?.value.trim() || '',
        businessModel: document.getElementById('admin-company-section-business-model')?.value.trim() || '',
        operatingModel: document.getElementById('admin-company-section-operating-model')?.value.trim() || '',
        publicCommitments: document.getElementById('admin-company-section-commitments')?.value.trim() || '',
        keyRiskSignals: document.getElementById('admin-company-section-risks')?.value.trim() || '',
        obligations: document.getElementById('admin-company-section-obligations')?.value.trim() || '',
        sources: document.getElementById('admin-company-section-sources')?.value.trim() || ''
      };
    }

    function applyResult(result = {}) {
      const sections = buildCompanyContextSections(result);
      const profileText = serialiseCompanyContextSections(sections);
      if (profileEl) profileEl.value = profileText;
      const fieldValues = {
        'admin-company-section-summary': sections.companySummary || '',
        'admin-company-section-business-model': sections.businessModel || '',
        'admin-company-section-operating-model': sections.operatingModel || '',
        'admin-company-section-commitments': sections.publicCommitments || '',
        'admin-company-section-risks': sections.keyRiskSignals || '',
        'admin-company-section-obligations': sections.obligations || '',
        'admin-company-section-sources': sections.sources || ''
      };
      Object.entries(fieldValues).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
      });
      const adminContextSummaryEl = document.getElementById('admin-context-summary');
      if (result.companySummary && adminContextSummaryEl && !adminContextSummaryEl.value.trim()) {
        adminContextSummaryEl.value = result.companySummary;
      }
      const adminAiInstructionsEl = document.getElementById('admin-ai-instructions');
      if (result.aiGuidance && adminAiInstructionsEl) {
        adminAiInstructionsEl.value = result.aiGuidance;
      }
      const adminGeoEl = document.getElementById('admin-geo');
      if (result.suggestedGeography && adminGeoEl && !adminGeoEl.value.trim()) {
        adminGeoEl.value = result.suggestedGeography;
      }
      if (Array.isArray(result.regulatorySignals) && result.regulatorySignals.length && regsInput?.setTags) {
        regsInput.setTags(Array.from(new Set([...(regsInput.getTags() || []), ...result.regulatorySignals])));
      }
      return { sections, profileText };
    }

    function renderHistory() {
      if (!historyEl) return;
      if (!history.length) {
        historyEl.innerHTML = '<div class="form-help">No follow-up prompts yet. Build the initial context, then iterate here until the summary feels right.</div>';
        return;
      }
      historyEl.innerHTML = history.map((entry) => `
        <div class="card" style="padding:var(--sp-3);background:var(--bg-canvas)">
          <div class="context-panel-title" style="font-size:.82rem;text-transform:uppercase;letter-spacing:.06em;color:var(--text-muted)">${entry.role === 'user' ? 'Your prompt' : 'AI update'}</div>
          <div style="margin-top:6px;color:var(--text-primary);line-height:1.55">${escapeHtml(entry.text || '')}</div>
        </div>`).join('');
    }

    async function buildFromWebsite() {
      const button = document.getElementById('btn-build-company-context');
      const websiteUrl = websiteEl?.value.trim() || '';
      if (!button) return;
      if (!websiteUrl) {
        UI.toast('Enter a company website URL first.', 'warning');
        return;
      }
      button.disabled = true;
      button.textContent = 'Building context…';
      try {
        LLMService.setCompassConfig(getCompassConfigFromAdminInputs());
        const uploaded = await loadContextSupportSource('admin-company-source-file', 'admin-company-source-help');
        let result = await LLMService.buildCompanyContext(websiteUrl);
        let { sections, profileText } = applyResult(result);
        if (uploaded.text) {
          result = await LLMService.refineCompanyContext({
            websiteUrl,
            currentSections: getCurrentSections(),
            currentAiGuidance: document.getElementById('admin-ai-instructions')?.value.trim() || '',
            currentGeography: document.getElementById('admin-geo')?.value.trim() || '',
            currentRegulations: regsInput?.getTags ? regsInput.getTags() : [],
            history: [],
            userPrompt: 'Incorporate the uploaded strategy, policy, procedure, and operating-model material into this company context draft while keeping it concise and grounded.',
            uploadedText: '',
            uploadedDocumentName: ''
          });
          ({ sections, profileText } = applyResult(result));
        }
        history.length = 0;
        history.push({
          role: 'assistant',
          text: uploaded.text
            ? 'Initial company context draft created and refined using the uploaded source material. Use follow-up prompts below if you want to reshape it further.'
            : 'Initial company context draft created. Use follow-up prompts below if you want to reshape it further.'
        });
        renderHistory();
        if (statusEl) statusEl.textContent = 'Initial AI draft applied. Use the follow-up prompt box below to keep refining it.';
        AdminOrgSetupSection.openEntityEditor(null, {
          name: inferCompanyNameFromUrl(websiteUrl),
          websiteUrl,
          profile: profileText,
          contextSections: sections,
          type: 'Holding company'
        });
        UI.toast('Company context built from public sources. Review the entity and place it into the organisation tree.', 'success', 5000);
      } catch (error) {
        UI.toast('Company context build failed. Try again or shorten the source material.', 'danger', 6000);
        if (statusEl) statusEl.textContent = 'Company context build failed. Try again or shorten the source material.';
      } finally {
        button.disabled = false;
        button.textContent = 'Build from Website';
      }
    }

    async function refineContext() {
      const prompt = followupEl?.value.trim() || '';
      const websiteUrl = websiteEl?.value.trim() || '';
      const button = document.getElementById('btn-refine-admin-company-context');
      if (!button) return;
      if (!websiteUrl) {
        UI.toast('Enter a company website URL first.', 'warning');
        return;
      }
      if (!prompt) {
        UI.toast('Enter a follow-up prompt first.', 'warning');
        return;
      }
      button.disabled = true;
      button.textContent = 'Applying…';
      try {
        if (statusEl) statusEl.textContent = 'Applying your latest instruction to the company context…';
        history.push({ role: 'user', text: prompt });
        renderHistory();
        LLMService.setCompassConfig(getCompassConfigFromAdminInputs());
        const uploaded = await loadContextSupportSource('admin-company-source-file', 'admin-company-source-help');
        const refineInput = {
          websiteUrl,
          currentSections: getCurrentSections(),
          currentAiGuidance: document.getElementById('admin-ai-instructions')?.value.trim() || '',
          currentGeography: document.getElementById('admin-geo')?.value.trim() || '',
          currentRegulations: regsInput?.getTags ? regsInput.getTags() : [],
          history,
          userPrompt: prompt,
          uploadedText: uploaded.text,
          uploadedDocumentName: uploaded.name
        };
        let result;
        try {
          result = await LLMService.refineCompanyContext(refineInput);
        } catch {
          result = buildLocalCompanyContextFallback(refineInput);
        }
        applyResult(result);
        history.push({ role: 'assistant', text: result.responseMessage || 'I refined the company context based on your latest prompt.' });
        renderHistory();
        if (followupEl) followupEl.value = '';
        if (statusEl) statusEl.textContent = 'Latest follow-up applied. Keep iterating until the context feels right.';
        UI.toast('Admin company context refined.', 'success', 5000);
      } catch (error) {
        UI.toast('Company context refinement failed. Try again or shorten the prompt.', 'danger', 6000);
        if (statusEl) statusEl.textContent = 'Company context refinement failed. Try again or shorten the prompt.';
      } finally {
        button.disabled = false;
        button.textContent = 'Apply Follow-Up Now';
      }
    }

    renderHistory();

    return {
      bind() {
        // Keep company-context handlers in one controller so admin settings rendering stays declarative.
        document.getElementById('btn-build-company-context')?.addEventListener('click', buildFromWebsite);
        document.getElementById('btn-refine-admin-company-context')?.addEventListener('click', refineContext);
      }
    };
  }

  global.AdminCompanyContextController = { create };
})(window);
