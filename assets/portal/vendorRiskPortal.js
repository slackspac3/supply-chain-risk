(function(globalScope) {
  'use strict';

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatDate(value, fallback = 'Not scheduled') {
    const timestamp = new Date(value || '').getTime();
    if (!timestamp) return fallback;
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    }).format(timestamp);
  }

  function formatDateTime(value, fallback = 'Not available') {
    const timestamp = new Date(value || '').getTime();
    if (!timestamp) return fallback;
    return new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(timestamp);
  }

  function getStatusMeta(status = '') {
    const safeStatus = String(status || '').trim();
    const labelMap = {
      intake: 'Intake',
      vendor_in_progress: 'Vendor in progress',
      internal_review: 'Internal review',
      awaiting_vendor_clarification: 'Awaiting vendor',
      approval_pending: 'Approval pending',
      approved: 'Approved',
      conditional_pass: 'Conditional pass',
      fail: 'Fail',
      monitoring: 'Monitoring',
      closed: 'Closed'
    };
    const badgeClass = safeStatus === 'approved'
      ? 'badge--success'
      : safeStatus === 'conditional_pass'
        ? 'badge--warning'
        : safeStatus === 'fail'
          ? 'badge--danger'
          : safeStatus === 'internal_review'
            ? 'badge--neutral'
            : 'badge--outline';
    return {
      label: labelMap[safeStatus] || safeStatus || 'Unknown',
      badgeClass
    };
  }

  function getRoleLabel(role = '') {
    return globalScope.PortalAccessService?.getRoleMeta?.(role)?.label || String(role || 'User');
  }

  function getCurrentUser() {
    return globalScope.AuthService?.getCurrentUser?.() || null;
  }

  function getVisibleCases() {
    return globalScope.VendorCaseService?.getCasesForUser?.(getCurrentUser()) || [];
  }

  function getPrimaryVisibleCase() {
    return globalScope.VendorCaseService?.getPrimaryCaseForUser?.(getCurrentUser()) || null;
  }

  function getQuestionSet(caseRecord) {
    const deepDiveTopics = Array.isArray(caseRecord?.intakeOutput?.serviceProfile?.deepDiveTopics)
      ? caseRecord.intakeOutput.serviceProfile.deepDiveTopics
      : [];
    const baseQuestions = [
      {
        key: 'security_program',
        label: 'Security governance and assurance',
        hint: 'Describe the security program, policy ownership, and current certifications or audit reports.'
      },
      {
        key: 'access_management',
        label: 'Access management',
        hint: 'Explain workforce access control, privileged access, MFA, and joiner-mover-leaver control.'
      },
      {
        key: 'encryption_controls',
        label: 'Encryption and data handling',
        hint: 'Describe encryption at rest, in transit, and any segregation controls for customer or G42 data.'
      },
      {
        key: 'incident_notification',
        label: 'Incident response and notification',
        hint: 'Describe incident-detection, escalation, customer notification timing, and forensic support.'
      }
    ];
    const serviceQuestions = deepDiveTopics.slice(0, 4).map((topic) => ({
      key: `topic_${String(topic || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`,
      label: topic,
      hint: `Describe the controls, process, and evidence you can provide for ${String(topic || '').toLowerCase()}.`
    }));
    return [...baseQuestions, ...serviceQuestions];
  }

  function renderEvidenceList(evidenceFiles = []) {
    if (!Array.isArray(evidenceFiles) || !evidenceFiles.length) {
      return '<div class="form-help">No evidence uploaded yet.</div>';
    }
    return `<div class="portal-stack">${evidenceFiles.map((file) => `
      <div class="portal-list-item">
        <strong>${escapeHtml(file.name)}</strong>
        <span>${escapeHtml(file.type || 'File')} • ${Math.max(1, Math.round(Number(file.sizeBytes || 0) / 1024))} KB • uploaded ${escapeHtml(formatDateTime(file.uploadedAt))}</span>
      </div>
    `).join('')}</div>`;
  }

  function renderClarificationHistory(history = []) {
    if (!Array.isArray(history) || !history.length) {
      return '<div class="form-help">No clarification loop is open for this case.</div>';
    }
    return `<div class="portal-stack">${history.map((item) => `
      <div class="portal-list-item">
        <strong>${escapeHtml(item.direction === 'vendor_response' ? 'Vendor response' : 'Internal request')}</strong>
        <span>${escapeHtml(formatDateTime(item.at))} • ${escapeHtml(item.actor || item.actorRole || 'Unknown')}</span>
        <div class="form-help" style="margin-top:6px">${escapeHtml(item.message)}</div>
      </div>
    `).join('')}</div>`;
  }

  function renderActivityTimeline(activity = []) {
    if (!Array.isArray(activity) || !activity.length) {
      return '<div class="form-help">No case activity has been recorded yet.</div>';
    }
    return `<div class="portal-stack">${activity.slice().reverse().map((entry) => `
      <div class="portal-list-item">
        <strong>${escapeHtml(entry.message || entry.type || 'Case update')}</strong>
        <span>${escapeHtml(formatDateTime(entry.at))} • ${escapeHtml(entry.actor || entry.actorRole || 'System')}</span>
      </div>
    `).join('')}</div>`;
  }

  function renderFindingList(findings = []) {
    if (!Array.isArray(findings) || !findings.length) {
      return '<div class="form-help">No findings recorded yet.</div>';
    }
    return `<div class="portal-stack">${findings.map((finding) => `
      <div class="portal-list-item">
        <strong>${escapeHtml(finding.title)}</strong>
        <span>${escapeHtml(String(finding.severity || 'medium').toUpperCase())}</span>
        <div class="form-help" style="margin-top:6px">${escapeHtml(finding.detail)}</div>
        ${finding.mitigation ? `<div class="form-help" style="margin-top:6px"><strong>Mitigation:</strong> ${escapeHtml(finding.mitigation)}</div>` : ''}
      </div>
    `).join('')}</div>`;
  }

  function renderAiAnalysis(analysis = null) {
    if (!analysis) {
      return '<div class="form-help">No backend AI analysis has been run for this case yet.</div>';
    }
    return `
      <div class="portal-stack">
        <div class="portal-list-item">
          <strong>${escapeHtml(analysis.summaryStatement || 'AI analysis available')}</strong>
          <span>${escapeHtml(analysis.serviceType || 'service')} • ${escapeHtml(analysis.criticalityTier || 'criticality pending')}</span>
        </div>
        <div class="portal-two-column-list">
          <div><strong>Regulatory impact</strong><div class="form-help">${escapeHtml((analysis.regulatoryImpact || []).join(', ') || 'None flagged')}</div></div>
          <div><strong>Recommended clause packs</strong><div class="form-help">${escapeHtml((analysis.recommendedClausePackIds || []).join(', ') || 'None')}</div></div>
        </div>
        ${Array.isArray(analysis.riskStatements) && analysis.riskStatements.length ? `
          <div class="portal-stack">
            ${analysis.riskStatements.map((item) => `
              <div class="portal-list-item">
                <strong>${escapeHtml(item.title || 'Risk statement')}</strong>
                <span>${escapeHtml(`${String(item.likelihood || '').toUpperCase()} likelihood • ${String(item.impact || '').toUpperCase()} impact`)}</span>
                <div class="form-help" style="margin-top:6px">${escapeHtml(item.statement || '')}</div>
                <div class="form-help" style="margin-top:6px"><strong>Mitigation:</strong> ${escapeHtml(item.mitigation || '')}</div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>`;
  }

  function renderEmptyPortal(title, body) {
    globalScope.setPage(`
      <main class="page portal-shell portal-shell--neutral">
        <div class="container container--narrow" style="padding:var(--sp-16) var(--sp-6)">
          <div class="card card--elevated portal-empty-card">
            <div class="landing-badge landing-badge--review">Vendor assurance PoC</div>
            <h2 style="margin-top:var(--sp-4)">${escapeHtml(title)}</h2>
            <p class="form-help" style="margin-top:8px">${escapeHtml(body)}</p>
          </div>
        </div>
      </main>
    `);
  }

  async function runBackendAiAnalysis(caseRecord, triggerButton, statusNode) {
    if (!caseRecord) return;
    const apiUrl = globalScope.ApiOriginResolver?.resolveApiUrl?.('/api/ai/vendor-assessment-analysis') || '/api/ai/vendor-assessment-analysis';
    const payload = {
      vendorName: caseRecord.vendorName,
      contractDescription: caseRecord.contractDescription,
      serviceScope: caseRecord.serviceScope,
      serviceTypeHint: caseRecord.serviceType,
      scenarioSummary: caseRecord.decision.riskStatement || caseRecord.decision.summaryStatement || caseRecord.vendor.latestMessage || '',
      dataAccessRequired: !!caseRecord?.intake?.dataAccessRequired,
      dataTypes: Array.isArray(caseRecord?.intake?.dataTypes) ? caseRecord.intake.dataTypes : [],
      headquartered: caseRecord?.intake?.headquartered || '',
      subprocessors: Array.isArray(caseRecord?.intake?.subprocessors) ? caseRecord.intake.subprocessors : [],
      hostingRegion: caseRecord?.intake?.hostingRegion || '',
      businessUnit: caseRecord.businessUnit || '',
      questionnaireFindings: Object.entries(caseRecord.questionnaire.responses || {}).map(([key, value]) => `${key}: ${value}`),
      evidenceSummaries: (caseRecord.vendor.evidenceFiles || []).map((file) => `${file.name} (${file.type || 'file'})`),
      requiredClauses: (caseRecord.clauseFrame.recommendedClausePacks || []).flatMap((pack) => Array.isArray(pack.clauses) ? pack.clauses : []),
      existingContractClauses: Array.isArray(caseRecord.internal.controlRecommendations)
        ? caseRecord.internal.controlRecommendations
        : [],
      traceLabel: `${caseRecord.id} internal review`
    };

    triggerButton.disabled = true;
    if (statusNode) statusNode.textContent = 'Running backend AI analysis…';

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-session-token': globalScope.AuthService?.getApiSessionToken?.() || ''
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(String(result?.error || 'The AI analysis request failed.'));
      }
      globalScope.VendorCaseService?.saveAiAnalysis?.(caseRecord.id, result);
      globalScope.UI?.toast?.('Backend AI analysis refreshed.', 'success');
      renderInternalCaseReview(caseRecord.id);
    } catch (error) {
      if (statusNode) statusNode.textContent = 'The backend AI analysis could not be refreshed right now.';
      globalScope.UI?.toast?.(String(error?.message || 'The backend AI analysis could not be refreshed right now.'), 'warning');
      triggerButton.disabled = false;
    }
  }

  function renderInternalPortalHome() {
    const currentUser = getCurrentUser();
    const visibleCases = getVisibleCases();
    const summary = globalScope.VendorCaseService?.getDashboardSummary?.(currentUser) || {
      totalCases: 0,
      awaitingVendor: 0,
      internalReview: 0,
      approvalPending: 0,
      approved: 0,
      periodicDue: 0
    };
    const nextCase = visibleCases.find((item) => item.status === 'awaiting_vendor_clarification' || item.status === 'internal_review') || visibleCases[0] || null;

    globalScope.setPage(`
      <main class="dashboard-shell portal-shell portal-shell--internal">
        <section class="dashboard-primary-band">
          <div class="dashboard-hero dashboard-hero--start portal-hero portal-hero--internal">
            <div class="landing-badge landing-badge--internal">Internal GTR Console</div>
            <div class="dashboard-hero-grid dashboard-hero-grid--balanced">
              <div class="dashboard-hero-main">
                <h2>Vendor assurance workbench</h2>
                <p class="dashboard-hero-copy">Review intake, vendor responses, evidence, clause checks, and approval paths from a dedicated internal operating console rather than the older scenario-led calculator flow.</p>
                <div class="portal-hero-pills">
                  <span class="portal-hero-pill">Internal review lane</span>
                  <span class="portal-hero-pill">AI-assisted assessment</span>
                  <span class="portal-hero-pill">Separate vendor workspace</span>
                </div>
                <div class="dashboard-start-primary__actions">
                  <a class="btn btn--primary" href="#/internal/cases">Open case queue</a>
                  ${nextCase ? `<a class="btn btn--secondary" href="#/internal/review/${encodeURIComponent(nextCase.id)}">Open next case</a>` : ''}
                </div>
              </div>
              <div class="dashboard-hero-side dashboard-hero-side--support">
                <div class="dashboard-hero-side-copy">
                  <strong>${escapeHtml(currentUser?.displayName || 'Internal user')}</strong>
                  <span>${escapeHtml(getRoleLabel(currentUser?.role))}</span>
                </div>
                <div class="dashboard-side-summary-list">
                  <div class="dashboard-side-summary-item dashboard-side-summary-item--gold">
                    <span class="dashboard-side-summary-item__label">Awaiting vendor</span>
                    <strong>${summary.awaitingVendor}</strong>
                  </div>
                  <div class="dashboard-side-summary-item dashboard-side-summary-item--warning">
                    <span class="dashboard-side-summary-item__label">Internal review</span>
                    <strong>${summary.internalReview}</strong>
                  </div>
                  <div class="dashboard-side-summary-item dashboard-side-summary-item--success">
                    <span class="dashboard-side-summary-item__label">Periodic due</span>
                    <strong>${summary.periodicDue}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="dashboard-status-band dashboard-status-band--compact">
          ${globalScope.UI.dashboardOverviewCard({ label: 'Visible cases', value: String(summary.totalCases), foot: 'Cases currently visible to the internal portal.' })}
          ${globalScope.UI.dashboardOverviewCard({ label: 'Approval pending', value: String(summary.approvalPending), foot: 'Items waiting for an approval decision.' })}
          ${globalScope.UI.dashboardOverviewCard({ label: 'Conditional or approved', value: String(summary.approved), foot: 'Cases with a recorded approval outcome.' })}
        </section>
        <section class="dashboard-secondary-grid">
          ${globalScope.UI.dashboardSectionCard({
            title: 'Priority queue',
            description: 'Open the items that need GTR attention next.',
            badge: visibleCases.length ? `${visibleCases.length} cases` : 'No cases',
            body: visibleCases.length
              ? visibleCases.slice(0, 3).map((caseRecord) => {
                const statusMeta = getStatusMeta(caseRecord.status);
                return globalScope.UI.dashboardAssessmentRow({
                  assessmentId: caseRecord.id,
                  title: `${caseRecord.id} • ${caseRecord.vendorName}`,
                  detail: `${caseRecord.serviceType || 'service'} • ${caseRecord.businessUnit || 'No BU'} • due ${formatDate(caseRecord.schedule.dueDate)}`,
                  badgeClass: statusMeta.badgeClass,
                  badgeLabel: statusMeta.label,
                  actions: `<a class="btn btn--secondary btn--sm" href="#/internal/review/${encodeURIComponent(caseRecord.id)}">Review case</a>`
                });
              }).join('')
              : '<div class="form-help">No vendor cases are visible for this internal role yet.</div>'
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Decision model',
            description: 'The PoC keeps the current GTR checkpoint logic explicit.',
            body: `
              <div class="portal-stack">
                <div class="portal-list-item"><strong>Tier 1 Critical</strong><span>Agreement with risk statement and must-have controls</span></div>
                <div class="portal-list-item"><strong>Tier 2 Important</strong><span>Exception approval path with tracked conditions</span></div>
                <div class="portal-list-item"><strong>Tier 3 Low Risk</strong><span>Autoapproval path when required control coverage is present</span></div>
              </div>
            `
          })}
        </section>
      </main>
    `);
  }

  function renderInternalCaseQueue() {
    const visibleCases = getVisibleCases();
    globalScope.setPage(`
      <main class="dashboard-shell portal-shell portal-shell--internal">
        <section class="dashboard-primary-band">
          <div class="dashboard-hero dashboard-hero--start portal-hero portal-hero--internal">
            <div class="landing-badge landing-badge--internal">Internal GTR Console</div>
            <div class="dashboard-hero-main">
              <h2>Case queue</h2>
              <p class="dashboard-hero-copy">Every visible case runs through the vendor-assessment model: intake, dynamic questionnaire, evidence review, decisioning, and reassessment timing.</p>
              <div class="portal-hero-pills">
                <span class="portal-hero-pill">Queue-first</span>
                <span class="portal-hero-pill">Review by case</span>
                <span class="portal-hero-pill">BU-aware visibility</span>
              </div>
            </div>
          </div>
        </section>
        <section class="dashboard-primary-band dashboard-primary-band--work">
          ${globalScope.UI.dashboardSectionCard({
            title: 'Open vendor assessments',
            description: 'Review cases in the internal portal. Vendors see the same case from their own external workspace.',
            badge: visibleCases.length ? `${visibleCases.length} cases` : 'No cases',
            body: visibleCases.length
              ? visibleCases.map((caseRecord) => {
                const statusMeta = getStatusMeta(caseRecord.status);
                return globalScope.UI.dashboardAssessmentRow({
                  assessmentId: caseRecord.id,
                  title: `${caseRecord.id} • ${caseRecord.vendorName}`,
                  detail: `${caseRecord.title} • ${caseRecord.serviceType || 'service'} • ${caseRecord.businessUnit || 'No BU'} • next reassessment ${formatDate(caseRecord.schedule.reassessmentDate)}`,
                  badgeClass: statusMeta.badgeClass,
                  badgeLabel: statusMeta.label,
                  actions: `<a class="btn btn--secondary btn--sm" href="#/internal/review/${encodeURIComponent(caseRecord.id)}">Open review</a>`
                });
              }).join('')
              : '<div class="form-help">No cases are available in the shared vendor-case store.</div>'
          })}
        </section>
      </main>
    `);
  }

  function renderInternalCaseReview(caseId) {
    const caseRecord = globalScope.VendorCaseService?.getCaseById?.(caseId) || null;
    if (!caseRecord) {
      renderEmptyPortal('Case not found', 'The requested vendor case is not available in the shared PoC store.');
      return;
    }
    const statusMeta = getStatusMeta(caseRecord.status);
    const clausePackIds = Array.isArray(caseRecord?.clauseFrame?.packIds) ? caseRecord.clauseFrame.packIds : [];
    const requiredPacks = Array.isArray(caseRecord?.clauseFrame?.recommendedClausePacks)
      ? caseRecord.clauseFrame.recommendedClausePacks
      : [];

    globalScope.setPage(`
      <main class="dashboard-shell portal-shell portal-shell--review">
        <section class="dashboard-primary-band">
          <div class="dashboard-hero dashboard-hero--start portal-hero portal-hero--review">
            <div class="landing-badge landing-badge--review">Assessment Review</div>
            <div class="dashboard-hero-grid dashboard-hero-grid--balanced">
              <div class="dashboard-hero-main">
                <h2>${escapeHtml(caseRecord.id)} • ${escapeHtml(caseRecord.vendorName)}</h2>
                <p class="dashboard-hero-copy">${escapeHtml(caseRecord.title)}</p>
                <div class="portal-hero-pills">
                  <span class="portal-hero-pill">Case evidence</span>
                  <span class="portal-hero-pill">Clause recommendation</span>
                  <span class="portal-hero-pill">Decision capture</span>
                </div>
                <div class="dashboard-start-primary__actions">
                  <a class="btn btn--ghost" href="#/internal/cases">Back to queue</a>
                  <a class="btn btn--secondary" href="#/internal/home">Return to portal</a>
                </div>
              </div>
              <div class="dashboard-hero-side dashboard-hero-side--support">
                <div class="dashboard-side-summary-list">
                  <div class="dashboard-side-summary-item dashboard-side-summary-item--gold">
                    <span class="dashboard-side-summary-item__label">Status</span>
                    <strong>${escapeHtml(statusMeta.label)}</strong>
                  </div>
                  <div class="dashboard-side-summary-item">
                    <span class="dashboard-side-summary-item__label">Criticality</span>
                    <strong>${escapeHtml(caseRecord.rating.criticality || 'Pending')}</strong>
                  </div>
                  <div class="dashboard-side-summary-item">
                    <span class="dashboard-side-summary-item__label">Decision</span>
                    <strong>${escapeHtml(caseRecord.decision.outcome || 'Pending')}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="dashboard-secondary-grid">
          ${globalScope.UI.dashboardSectionCard({
            title: 'Case frame',
            description: 'Stage 1 intake and current decision context.',
            body: `
              <div class="portal-two-column-list">
                <div><strong>Service type</strong><div class="form-help">${escapeHtml(caseRecord.serviceType || 'Pending')}</div></div>
                <div><strong>Business unit</strong><div class="form-help">${escapeHtml(caseRecord.businessUnit || 'Not set')}</div></div>
                <div><strong>Data types</strong><div class="form-help">${escapeHtml((caseRecord.intake.dataTypes || []).join(', ') || 'None')}</div></div>
                <div><strong>Hosting region</strong><div class="form-help">${escapeHtml(caseRecord.intake.hostingRegion || 'Not declared')}</div></div>
                <div><strong>Vendor HQ</strong><div class="form-help">${escapeHtml(caseRecord.intake.headquartered || 'Not declared')}</div></div>
                <div><strong>Reassessment</strong><div class="form-help">${escapeHtml(formatDate(caseRecord.schedule.reassessmentDate))}</div></div>
              </div>
              <div class="portal-inline-note"><strong>Summary:</strong> ${escapeHtml(caseRecord.decision.summaryStatement || 'No internal summary drafted yet.')}</div>
            `
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Findings and controls',
            description: 'Current internal findings and recommended controls.',
            body: `
              ${renderFindingList(caseRecord.internal.findings)}
              <div class="portal-inline-note"><strong>Recommended clause packs:</strong> ${escapeHtml(clausePackIds.join(', ') || 'None yet')}</div>
              <div class="portal-inline-note"><strong>Control recommendations:</strong> ${escapeHtml((caseRecord.internal.controlRecommendations || []).join(' | ') || 'None yet')}</div>
            `
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Backend AI assessment',
            description: 'Runs the server-side Compass workflow against the current case frame.',
            body: `
              ${renderAiAnalysis(caseRecord.internal.aiAnalysis)}
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                <button class="btn btn--secondary" id="btn-run-ai-analysis" type="button">Run backend AI analysis</button>
                <span class="form-help" id="ai-analysis-status">Uses the server route to check service type, clause coverage, risk statements, and recommendations.</span>
              </div>
            `
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Vendor submission',
            description: 'Evidence and clarification state shared with the vendor-facing portal.',
            body: `
              <div class="portal-inline-note"><strong>Questionnaire status:</strong> ${escapeHtml(caseRecord.questionnaire.status || 'Not started')}</div>
              <div class="portal-inline-note"><strong>Latest vendor message:</strong> ${escapeHtml(caseRecord.vendor.latestMessage || 'No vendor update yet.')}</div>
              <div class="portal-inline-note"><strong>Evidence files:</strong></div>
              ${renderEvidenceList(caseRecord.vendor.evidenceFiles)}
              <div class="portal-inline-note"><strong>Clarification loop:</strong></div>
              ${renderClarificationHistory(caseRecord.vendor.clarificationHistory)}
              <div class="form-group">
                <label class="form-label" for="internal-clarification-message">Request clarification from vendor</label>
                <textarea class="form-input" id="internal-clarification-message" rows="4" placeholder="Ask the vendor for missing evidence, coverage, or wording clarification."></textarea>
              </div>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                <button class="btn btn--secondary" id="btn-request-clarification" type="button">Send clarification request</button>
                <span class="form-help">This updates the shared case state and moves the case back to the vendor portal.</span>
              </div>
            `
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Decision capture',
            description: 'Keep the approval path explicit in the internal portal.',
            body: `
              <div class="grid-2">
                <div class="form-group">
                  <label class="form-label" for="decision-outcome">Outcome</label>
                  <select class="form-select" id="decision-outcome">
                    <option value="pending" ${caseRecord.decision.outcome === 'pending' ? 'selected' : ''}>Pending</option>
                    <option value="pass" ${caseRecord.decision.outcome === 'pass' ? 'selected' : ''}>Pass</option>
                    <option value="conditional_pass" ${caseRecord.decision.outcome === 'conditional_pass' ? 'selected' : ''}>Conditional pass</option>
                    <option value="fail" ${caseRecord.decision.outcome === 'fail' ? 'selected' : ''}>Fail</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="decision-likelihood">Likelihood</label>
                  <select class="form-select" id="decision-likelihood">
                    <option value="Low" ${caseRecord.rating.likelihood === 'Low' ? 'selected' : ''}>Low</option>
                    <option value="Medium" ${caseRecord.rating.likelihood === 'Medium' ? 'selected' : ''}>Medium</option>
                    <option value="High" ${caseRecord.rating.likelihood === 'High' ? 'selected' : ''}>High</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="decision-impact">Impact</label>
                  <select class="form-select" id="decision-impact">
                    <option value="Low" ${caseRecord.rating.impact === 'Low' ? 'selected' : ''}>Low</option>
                    <option value="Medium" ${caseRecord.rating.impact === 'Medium' ? 'selected' : ''}>Medium</option>
                    <option value="High" ${caseRecord.rating.impact === 'High' ? 'selected' : ''}>High</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="decision-risk-statement">Risk statement</label>
                <textarea class="form-input" id="decision-risk-statement" rows="4">${escapeHtml(caseRecord.decision.riskStatement || '')}</textarea>
              </div>
              <div class="form-group">
                <label class="form-label" for="decision-mitigation">Mitigation details</label>
                <textarea class="form-input" id="decision-mitigation" rows="4">${escapeHtml(caseRecord.decision.mitigation || '')}</textarea>
              </div>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                <button class="btn btn--primary" id="btn-save-decision" type="button">Save internal decision</button>
                <span class="form-help">Recommended packs in scope: ${escapeHtml(requiredPacks.map((pack) => pack.title).join(', ') || 'None')}</span>
              </div>
            `
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Case activity',
            description: 'Shared activity trail across the internal and vendor views.',
            body: renderActivityTimeline(caseRecord.activity)
          })}
        </section>
      </main>
    `);

    const aiButton = document.getElementById('btn-run-ai-analysis');
    const aiStatus = document.getElementById('ai-analysis-status');
    aiButton?.addEventListener('click', () => runBackendAiAnalysis(caseRecord, aiButton, aiStatus));

    document.getElementById('btn-request-clarification')?.addEventListener('click', () => {
      const message = document.getElementById('internal-clarification-message')?.value || '';
      const currentUser = getCurrentUser();
      if (!String(message || '').trim()) {
        globalScope.UI?.toast?.('Add the clarification request before sending it to the vendor.', 'warning');
        return;
      }
      globalScope.VendorCaseService?.requestClarification?.(caseRecord.id, message, {
        actorUsername: currentUser?.displayName || currentUser?.username || 'Internal team',
        actorRole: currentUser?.role || 'gtr_analyst'
      });
      globalScope.UI?.toast?.('Clarification request sent to the vendor portal.', 'success');
      renderInternalCaseReview(caseRecord.id);
    });

    document.getElementById('btn-save-decision')?.addEventListener('click', () => {
      const currentUser = getCurrentUser();
      const outcome = document.getElementById('decision-outcome')?.value || 'pending';
      const likelihood = document.getElementById('decision-likelihood')?.value || caseRecord.rating.likelihood;
      const impact = document.getElementById('decision-impact')?.value || caseRecord.rating.impact;
      const riskStatement = document.getElementById('decision-risk-statement')?.value || '';
      const mitigation = document.getElementById('decision-mitigation')?.value || '';
      globalScope.VendorCaseService?.saveInternalDecision?.(caseRecord.id, {
        outcome,
        likelihood,
        impact,
        riskStatement,
        mitigation,
        summaryStatement: caseRecord.decision.summaryStatement,
        checkpoint: caseRecord.decision.checkpoint
      }, {
        actorUsername: currentUser?.displayName || currentUser?.username || 'Internal approver',
        actorRole: currentUser?.role || 'approver'
      });
      globalScope.UI?.toast?.('Internal decision saved.', 'success');
      renderInternalCaseReview(caseRecord.id);
    });
  }

  function renderVendorPortalHome() {
    const currentUser = getCurrentUser();
    const visibleCases = getVisibleCases();
    const primaryCase = visibleCases[0] || null;
    const summary = globalScope.VendorCaseService?.getDashboardSummary?.(currentUser) || {
      totalCases: 0,
      awaitingVendor: 0,
      internalReview: 0,
      approvalPending: 0,
      approved: 0,
      periodicDue: 0
    };

    if (!visibleCases.length) {
      renderEmptyPortal(
        'Vendor portal',
        'No case is linked to this vendor account yet. In the live flow this would be reached from a case-specific magic link.'
      );
      return;
    }

    globalScope.setPage(`
      <main class="dashboard-shell portal-shell portal-shell--vendor">
        <section class="dashboard-primary-band">
          <div class="dashboard-hero dashboard-hero--start portal-hero portal-hero--vendor">
            <div class="landing-badge landing-badge--vendor">External Vendor Workspace</div>
            <div class="dashboard-hero-grid dashboard-hero-grid--balanced">
              <div class="dashboard-hero-main">
                <h2>${escapeHtml(primaryCase.vendorName)} case workspace</h2>
                <p class="dashboard-hero-copy">Use this external workspace to complete the questionnaire, upload assurance artifacts, and respond to GTR follow-ups for the invited case only.</p>
                <div class="portal-hero-pills">
                  <span class="portal-hero-pill">Single-case access</span>
                  <span class="portal-hero-pill">Evidence upload</span>
                  <span class="portal-hero-pill">Clarification loop</span>
                </div>
                <div class="dashboard-start-primary__actions">
                  <a class="btn btn--primary" href="#/vendor/questionnaire/${encodeURIComponent(primaryCase.id)}">Open questionnaire</a>
                  <a class="btn btn--secondary" href="#/vendor/evidence/${encodeURIComponent(primaryCase.id)}">Upload evidence</a>
                </div>
              </div>
              <div class="dashboard-hero-side dashboard-hero-side--support">
                <div class="dashboard-side-summary-list">
                  <div class="dashboard-side-summary-item">
                    <span class="dashboard-side-summary-item__label">Visible cases</span>
                    <strong>${summary.totalCases}</strong>
                  </div>
                  <div class="dashboard-side-summary-item dashboard-side-summary-item--warning">
                    <span class="dashboard-side-summary-item__label">Action needed</span>
                    <strong>${summary.awaitingVendor}</strong>
                  </div>
                  <div class="dashboard-side-summary-item dashboard-side-summary-item--success">
                    <span class="dashboard-side-summary-item__label">Submitted / approved</span>
                    <strong>${summary.internalReview + summary.approved}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        <section class="dashboard-secondary-grid">
          ${globalScope.UI.dashboardSectionCard({
            title: 'Current case',
            description: 'The portal is restricted to the invited case and follow-up evidence.',
            badge: primaryCase.id,
            body: `
              <div class="portal-two-column-list">
                <div><strong>Status</strong><div class="form-help">${escapeHtml(getStatusMeta(primaryCase.status).label)}</div></div>
                <div><strong>Service type</strong><div class="form-help">${escapeHtml(primaryCase.serviceType || 'Pending')}</div></div>
                <div><strong>Due date</strong><div class="form-help">${escapeHtml(formatDate(primaryCase.schedule.dueDate))}</div></div>
                <div><strong>Reassessment</strong><div class="form-help">${escapeHtml(formatDate(primaryCase.schedule.reassessmentDate))}</div></div>
              </div>
              <div class="portal-inline-note"><strong>Latest update:</strong> ${escapeHtml(primaryCase.vendor.latestMessage || 'No update yet.')}</div>
            `
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Clarification loop',
            description: 'Any GTR questions or your responses stay attached to the case.',
            body: renderClarificationHistory(primaryCase.vendor.clarificationHistory)
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Evidence already uploaded',
            description: 'This PoC stores uploaded file metadata and keeps the file list visible to both portals.',
            body: renderEvidenceList(primaryCase.vendor.evidenceFiles)
          })}
        </section>
      </main>
    `);
  }

  function renderVendorQuestionnaire(caseId) {
    const caseRecord = globalScope.VendorCaseService?.getCaseById?.(caseId) || getPrimaryVisibleCase();
    if (!caseRecord) {
      renderEmptyPortal('Vendor questionnaire', 'No vendor case is available for this account.');
      return;
    }
    const questions = getQuestionSet(caseRecord);

    globalScope.setPage(`
      <main class="dashboard-shell portal-shell portal-shell--vendor">
        <section class="dashboard-primary-band">
          <div class="dashboard-hero dashboard-hero--start portal-hero portal-hero--vendor">
            <div class="landing-badge landing-badge--vendor">Vendor Questionnaire</div>
            <div class="dashboard-hero-main">
              <h2>${escapeHtml(caseRecord.vendorName)} • ${escapeHtml(caseRecord.id)}</h2>
              <p class="dashboard-hero-copy">This questionnaire is dynamically framed from the service type and intake context already captured for this case.</p>
              <div class="portal-hero-pills">
                <span class="portal-hero-pill">Service-specific prompts</span>
                <span class="portal-hero-pill">Draft or submit</span>
                <span class="portal-hero-pill">Evidence-backed response</span>
              </div>
            </div>
          </div>
        </section>
        <section class="dashboard-secondary-grid">
          ${globalScope.UI.dashboardSectionCard({
            title: 'Assessment frame',
            description: 'The dynamic scope comes from the internal intake and service-type inference.',
            body: `
              <div class="portal-two-column-list">
                <div><strong>Service scope</strong><div class="form-help">${escapeHtml(caseRecord.serviceScope || 'Not set')}</div></div>
                <div><strong>Service type</strong><div class="form-help">${escapeHtml(caseRecord.serviceType || 'Pending')}</div></div>
                <div><strong>Data profile</strong><div class="form-help">${escapeHtml((caseRecord.intake.dataTypes || []).join(', ') || 'No data declared')}</div></div>
                <div><strong>Deep-dive topics</strong><div class="form-help">${escapeHtml((caseRecord.intakeOutput?.serviceProfile?.deepDiveTopics || []).join(', ') || 'Standard readiness only')}</div></div>
              </div>
            `
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Questionnaire response',
            description: 'Save as draft or submit to GTR for internal review.',
            body: `
              <form id="vendor-questionnaire-form" class="portal-stack">
                ${questions.map((question) => `
                  <div class="form-group">
                    <label class="form-label" for="${escapeHtml(question.key)}">${escapeHtml(question.label)}</label>
                    <textarea class="form-input" id="${escapeHtml(question.key)}" name="${escapeHtml(question.key)}" rows="4" placeholder="${escapeHtml(question.hint)}">${escapeHtml(caseRecord.questionnaire.responses[question.key] || '')}</textarea>
                    <span class="form-help">${escapeHtml(question.hint)}</span>
                  </div>
                `).join('')}
                <div class="flex items-center gap-3" style="flex-wrap:wrap">
                  <button class="btn btn--secondary" id="btn-save-questionnaire-draft" type="button">Save draft</button>
                  <button class="btn btn--primary" id="btn-submit-questionnaire" type="submit">Submit to GTR</button>
                  <span class="form-help">Current status: ${escapeHtml(caseRecord.questionnaire.status || 'not_started')}</span>
                </div>
              </form>
            `
          })}
        </section>
      </main>
    `);

    const form = document.getElementById('vendor-questionnaire-form');
    const collectResponses = () => questions.reduce((accumulator, question) => {
      accumulator[question.key] = document.getElementById(question.key)?.value || '';
      return accumulator;
    }, {});
    document.getElementById('btn-save-questionnaire-draft')?.addEventListener('click', () => {
      globalScope.VendorCaseService?.saveVendorQuestionnaire?.(caseRecord.id, collectResponses(), {
        submitted: false,
        actorUsername: getCurrentUser()?.username || 'vendor'
      });
      globalScope.UI?.toast?.('Questionnaire draft saved.', 'success');
      renderVendorQuestionnaire(caseRecord.id);
    });
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      globalScope.VendorCaseService?.saveVendorQuestionnaire?.(caseRecord.id, collectResponses(), {
        submitted: true,
        actorUsername: getCurrentUser()?.username || 'vendor'
      });
      globalScope.UI?.toast?.('Questionnaire submitted to GTR.', 'success');
      globalScope.Router?.navigate?.(`/vendor/home`);
    });
  }

  function renderVendorEvidence(caseId) {
    const caseRecord = globalScope.VendorCaseService?.getCaseById?.(caseId) || getPrimaryVisibleCase();
    if (!caseRecord) {
      renderEmptyPortal('Vendor evidence', 'No vendor case is available for this account.');
      return;
    }

    globalScope.setPage(`
      <main class="dashboard-shell portal-shell portal-shell--vendor">
        <section class="dashboard-primary-band">
          <div class="dashboard-hero dashboard-hero--start portal-hero portal-hero--vendor">
            <div class="landing-badge landing-badge--vendor">Vendor Evidence</div>
            <div class="dashboard-hero-main">
              <h2>${escapeHtml(caseRecord.vendorName)} • evidence and follow-up</h2>
              <p class="dashboard-hero-copy">Upload assurance artifacts for the case and respond to any clarification requests from the internal team.</p>
              <div class="portal-hero-pills">
                <span class="portal-hero-pill">Artifact upload</span>
                <span class="portal-hero-pill">Follow-up response</span>
                <span class="portal-hero-pill">Shared case history</span>
              </div>
            </div>
          </div>
        </section>
        <section class="dashboard-secondary-grid">
          ${globalScope.UI.dashboardSectionCard({
            title: 'Upload evidence',
            description: 'For the PoC, file metadata is stored in the shared case state and shown in both portals.',
            body: `
              <div class="form-group">
                <label class="form-label" for="vendor-evidence-files">Choose files</label>
                <input class="form-input" id="vendor-evidence-files" type="file" multiple>
                <span class="form-help">Use this for SOC 2 reports, ISO certificates, policy extracts, signed attestations, or similar supporting evidence.</span>
              </div>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                <button class="btn btn--secondary" id="btn-upload-evidence" type="button">Add selected files</button>
                <span class="form-help">Current uploaded files: ${escapeHtml(String((caseRecord.vendor.evidenceFiles || []).length))}</span>
              </div>
              ${renderEvidenceList(caseRecord.vendor.evidenceFiles)}
            `
          })}
          ${globalScope.UI.dashboardSectionCard({
            title: 'Clarification response',
            description: 'Use this when GTR requests more detail before decisioning.',
            body: `
              ${renderClarificationHistory(caseRecord.vendor.clarificationHistory)}
              <div class="form-group">
                <label class="form-label" for="vendor-clarification-response">Response to GTR</label>
                <textarea class="form-input" id="vendor-clarification-response" rows="4" placeholder="Respond to the latest clarification request or explain the evidence you uploaded."></textarea>
              </div>
              <div class="flex items-center gap-3" style="flex-wrap:wrap">
                <button class="btn btn--primary" id="btn-send-vendor-response" type="button">Send response</button>
                <a class="btn btn--ghost" href="#/vendor/questionnaire/${encodeURIComponent(caseRecord.id)}">Back to questionnaire</a>
              </div>
            `
          })}
        </section>
      </main>
    `);

    document.getElementById('btn-upload-evidence')?.addEventListener('click', () => {
      const input = document.getElementById('vendor-evidence-files');
      const files = Array.from(input?.files || []).map((file) => ({
        name: file.name,
        sizeBytes: file.size,
        type: file.type || 'application/octet-stream',
        uploadedBy: getCurrentUser()?.username || 'vendor',
        uploadedAt: new Date().toISOString()
      }));
      if (!files.length) {
        globalScope.UI?.toast?.('Choose one or more files before uploading evidence.', 'warning');
        return;
      }
      globalScope.VendorCaseService?.addEvidenceFiles?.(caseRecord.id, files, {
        actorUsername: getCurrentUser()?.username || 'vendor'
      });
      globalScope.UI?.toast?.('Evidence metadata added to the case.', 'success');
      renderVendorEvidence(caseRecord.id);
    });

    document.getElementById('btn-send-vendor-response')?.addEventListener('click', () => {
      const message = document.getElementById('vendor-clarification-response')?.value || '';
      if (!String(message || '').trim()) {
        globalScope.UI?.toast?.('Add your clarification response before sending it.', 'warning');
        return;
      }
      globalScope.VendorCaseService?.addVendorClarificationResponse?.(caseRecord.id, message, {
        actorUsername: getCurrentUser()?.username || 'vendor'
      });
      globalScope.UI?.toast?.('Your response was sent to the internal team.', 'success');
      renderVendorEvidence(caseRecord.id);
    });
  }

  globalScope.renderInternalPortalHome = renderInternalPortalHome;
  globalScope.renderInternalCaseQueue = renderInternalCaseQueue;
  globalScope.renderInternalCaseReview = renderInternalCaseReview;
  globalScope.renderVendorPortalHome = renderVendorPortalHome;
  globalScope.renderVendorQuestionnaire = renderVendorQuestionnaire;
  globalScope.renderVendorEvidence = renderVendorEvidence;
})(window);
