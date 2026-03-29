(function(global) {
  'use strict';

  const draftScenarioState = global.DraftScenarioState;

  async function runIntakeAssist() {
    const narrative = document.getElementById('intake-risk-statement')?.value.trim() || AppState.draft.narrative || '';
    const assistSeed = draftScenarioState.getIntakeAssistSeedNarrative(narrative || AppState.draft.registerFindings);
    const output = document.getElementById('intake-output');
    const bu = getBUList().find(b => b.id === (document.getElementById('wizard-bu')?.value || AppState.draft.buId));
    if (!narrative && !AppState.draft.registerFindings) {
      UI.toast('Add a risk statement or upload a risk register first.', 'warning');
      return;
    }
    if (output) output.innerHTML = UI.wizardAssistSkeleton();
    try {
      const aiContext = buildCurrentAIAssistContext({ buId: bu?.id || AppState.draft.buId });
      const citations = await RAGService.retrieveRelevantDocs(bu?.id, assistSeed || AppState.draft.registerFindings, 5);
      const result = await LLMService.enhanceRiskContext({
        riskStatement: assistSeed || narrative,
        registerText: AppState.draft.registerFindings,
        registerMeta: AppState.draft.registerMeta,
        businessUnit: aiContext.businessUnit || bu,
        geography: formatScenarioGeographies(getScenarioGeographies()),
        applicableRegulations: deriveApplicableRegulations(aiContext.businessUnit || bu, getSelectedRisks(), getScenarioGeographies()),
        guidedInput: { ...AppState.draft.guidedInput },
        citations,
        adminSettings: aiContext.adminSettings
      });
      draftScenarioState.applyScenarioAssistResultToDraft(result, {
        narrative,
        assistSeed,
        bu,
        citations,
        nextNarrative: result.enhancedStatement || narrative
      });
      saveDraft();
      renderWizard1();
      UI.toast(result.usedFallback ? 'Suggested draft loaded with fallback guidance. Review before continuing.' : 'Suggested draft intake completed.', result.usedFallback ? 'warning' : 'success', 5000);
    } catch (error) {
      if (output) output.innerHTML = `<div class="banner banner--danger"><span class="banner-icon">⚠</span><span class="banner-text">AI intake error: ${error.message}</span></div>`;
    }
  }

  async function enhanceNarrativeWithAI() {
    const narrative = document.getElementById('intake-risk-statement')?.value.trim() || AppState.draft.narrative || '';
    const assistSeed = draftScenarioState.getIntakeAssistSeedNarrative(narrative);
    const output = document.getElementById('intake-output');
    const bu = getBUList().find(b => b.id === (document.getElementById('wizard-bu')?.value || AppState.draft.buId));
    if (!narrative) {
      UI.toast('Enter a risk statement first.', 'warning');
      return;
    }
    const button = document.getElementById('btn-enhance-risk-statement');
    const resetButton = _setStep1ButtonBusy(button, 'Enhancing…');
    if (output) output.innerHTML = UI.wizardAssistSkeleton();
    try {
      const aiContext = buildCurrentAIAssistContext({ buId: bu?.id || AppState.draft.buId });
      const citations = await RAGService.retrieveRelevantDocs(bu?.id, assistSeed || narrative, 5);
      const result = await LLMService.enhanceRiskContext({
        riskStatement: assistSeed || narrative,
        registerText: '',
        registerMeta: null,
        businessUnit: aiContext.businessUnit || bu,
        geography: formatScenarioGeographies(getScenarioGeographies()),
        applicableRegulations: deriveApplicableRegulations(aiContext.businessUnit || bu, getSelectedRisks(), getScenarioGeographies()),
        guidedInput: { ...AppState.draft.guidedInput },
        citations,
        adminSettings: aiContext.adminSettings
      });
      draftScenarioState.applyScenarioAssistResultToDraft(result, {
        narrative,
        assistSeed,
        bu,
        citations,
        nextNarrative: result.enhancedStatement || narrative
      });
      saveDraft();
      renderWizard1();
      UI.toast(result.usedFallback ? 'Suggested draft enhancement loaded with fallback guidance. Review before continuing.' : 'Suggested draft enhancement loaded.', result.usedFallback ? 'warning' : 'success', 5000);
    } catch (error) {
      if (output) output.innerHTML = `<div class="banner banner--danger"><span class="banner-icon">⚠</span><span class="banner-text">AI enhancement is unavailable right now. Try again in a moment.</span></div>`;
    } finally {
      resetButton();
    }
  }

  async function analyseUploadedRegister() {
    if (!AppState.draft.registerFindings) {
      UI.toast('Upload a risk register first.', 'warning');
      return;
    }
    if (looksLikeBinaryRegister(AppState.draft.registerFindings)) {
      UI.toast('This uploaded file still looks binary and cannot be analysed safely. Please convert it to TXT, CSV, TSV, JSON, or Markdown.', 'warning', 7000);
      return;
    }
    const bu = getBUList().find(b => b.id === AppState.draft.buId);
    const button = document.getElementById('btn-register-analyse');
    const resetButton = _setStep1ButtonBusy(button, 'Uploading, extracting, and analysing…');
    try {
      const aiContext = buildCurrentAIAssistContext({ buId: bu?.id || AppState.draft.buId });
      const result = await LLMService.analyseRiskRegister({
        registerText: AppState.draft.registerFindings,
        registerMeta: AppState.draft.registerMeta,
        businessUnit: aiContext.businessUnit || bu,
        geography: formatScenarioGeographies(getScenarioGeographies()),
        applicableRegulations: AppState.draft.applicableRegulations || [],
        adminSettings: aiContext.adminSettings
      });
      const parsedFallback = parseRegisterText(AppState.draft.registerFindings).map(title => ({ title, source: 'register' }));
      const extractedRisks = result.risks || parsedFallback;
      if (!extractedRisks.length) {
        UI.toast('No usable risk lines were found in that file. Try a cleaner TXT/CSV export or paste the risks directly.', 'warning', 7000);
        return;
      }
      draftScenarioState.applyRegisterAnalysisResultToDraft(result, { parsedFallback });
      saveDraft();
      renderWizard1();
      UI.toast(result.usedFallback ? getRegisterFallbackToastCopy(result) : 'Suggested draft register analysis loaded.', result.usedFallback ? 'warning' : 'success', 7000);
    } catch (error) {
      UI.toast('Register analysis failed: ' + error.message, 'danger');
    } finally {
      resetButton();
    }
  }

  global.Step1Assist = {
    runIntakeAssist,
    enhanceNarrativeWithAI,
    analyseUploadedRegister
  };
})(window);
