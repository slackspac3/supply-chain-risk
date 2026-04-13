(function(global) {
  'use strict';

  function escapeAdminHomeText(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function resolveAdminHomeScenarioTitle(source = {}) {
    if (typeof resolveScenarioDisplayTitle === 'function') {
      const resolved = resolveScenarioDisplayTitle(source);
      if (String(resolved || '').trim()) return String(resolved).trim();
    }
    return String(source?.scenarioTitle || source?.title || 'Untitled assessment').trim() || 'Untitled assessment';
  }

  function formatAdminHomeDate(value) {
    return typeof formatOperationalDateTime === 'function'
      ? formatOperationalDateTime(value, { dateOnly: true, fallback: 'Unknown date' })
      : 'Unknown date';
  }

  function formatAdminHomeSyncTimestamp(value) {
    return typeof formatOperationalDateTime === 'function'
      ? formatOperationalDateTime(value, { includeSeconds: true, fallback: 'Not synced yet' })
      : 'Not synced yet';
  }

  function formatAdminHomeDataAge(value) {
    return typeof formatRelativePilotTime === 'function'
      ? formatRelativePilotTime(value, 'not loaded yet')
      : 'not loaded yet';
  }

  function renderAdminHomeLiveTimestamp(value, options = {}) {
    return typeof renderLiveTimestampValue === 'function'
      ? renderLiveTimestampValue(value, options)
      : escapeAdminHomeText(
          options.mode === 'absolute'
            ? formatAdminHomeSyncTimestamp(value)
            : formatAdminHomeDataAge(value)
        );
  }

  function renderReviewQueueFreshnessMeta(scope = 'admin') {
    const meta = typeof window.AppReviewQueueSync?.getSurfaceMeta === 'function'
      ? window.AppReviewQueueSync.getSurfaceMeta(scope)
      : { lastLoadedAt: 0, stale: false, error: '' };
    const notice = typeof window.AppReviewQueueSync?.getNotice === 'function'
      ? window.AppReviewQueueSync.getNotice()
      : null;
    const lastLoadedAt = Number(meta?.lastLoadedAt || 0);
    const stale = !!meta?.stale;
    const statusCopy = stale
      ? 'Review queue changed elsewhere. The latest items are being reloaded.'
      : meta?.error
        ? String(meta.error || 'Could not refresh the review queue right now.')
        : notice?.status === 'resolved' && Number(notice?.resolvedAt || 0) >= lastLoadedAt
          ? 'Review queue changed elsewhere and this view reloaded the latest state.'
          : 'This panel reloads when review ownership or status changes in another tab.';
    return `<div class="review-queue-sync-meta ${stale ? 'review-queue-sync-meta--stale' : ''}">
      <span>Last synced ${renderAdminHomeLiveTimestamp(lastLoadedAt, { tagName: 'strong', mode: 'absolute', includeSeconds: true, fallback: 'Not synced yet' })}</span>
      <span>Data age ${renderAdminHomeLiveTimestamp(lastLoadedAt, { tagName: 'strong', mode: 'relative', fallback: 'not loaded yet', staleAfterMs: 120000, staleClass: 'live-timestamp--stale' })}</span>
      <span>${escapeAdminHomeText(statusCopy)}</span>
    </div>`;
  }

  function resolveAdminHomeReviewQueueApiUrl(query = '') {
    const resolver = (typeof window !== 'undefined' && window?.ApiOriginResolver)
      || globalThis?.ApiOriginResolver
      || null;
    const safeQuery = String(query || '').trim();
    const path = safeQuery
      ? `/api/review-queue${safeQuery.startsWith('?') ? safeQuery : `?${safeQuery}`}`
      : '/api/review-queue';
    return resolver && typeof resolver.resolveApiUrl === 'function'
      ? resolver.resolveApiUrl(path)
      : path;
  }

  const AdminHomeSection = {
    render({
      settings,
      companyStructure,
      assessments,
      completedAssessments,
      reviewQueue,
      companyEntities,
      departmentEntities,
      managedAccounts,
      preferredAdminRoute,
      currentUserRole,
      docCount,
      valueSummary
    }) {
      const canAccessAdminRoute = (route) => (
        typeof PortalAccessService !== 'undefined'
        && PortalAccessService
        && typeof PortalAccessService.canAccessAdminRoute === 'function'
      ) ? PortalAccessService.canAccessAdminRoute(currentUserRole, route) : true;
      const currentUser = global.AuthService?.getCurrentUser?.() || null;
      const vendorCaseSummary = global.VendorCaseService?.getDashboardSummary?.(currentUser) || {
        totalCases: 0,
        awaitingVendor: 0,
        internalReview: 0,
        approvalPending: 0,
        approved: 0,
        periodicDue: 0
      };
      const adminQuickActions = [
        canAccessAdminRoute('/admin/settings/users')
          ? '<button type="button" class="btn btn--ghost" id="btn-admin-home-users">User Accounts</button>'
          : '',
        canAccessAdminRoute('/admin/settings/audit')
          ? '<button type="button" class="btn btn--ghost" id="btn-admin-home-audit">Audit Log</button>'
          : '',
        canAccessAdminRoute('/admin/bu')
          ? '<button type="button" class="btn btn--ghost" id="btn-admin-home-bu">Business Unit Profiles</button>'
          : '',
        canAccessAdminRoute('/admin/settings/defaults')
          ? '<button type="button" class="btn btn--ghost" id="btn-admin-home-defaults">Workflow Defaults</button>'
          : '',
        canAccessAdminRoute('/admin/docs')
          ? '<button type="button" class="btn btn--ghost" id="btn-admin-home-docs">Document Library</button>'
          : ''
      ].filter(Boolean).join('');
      return adminLayout('home', `
        <style>
          .review-queue-item {
            padding:var(--sp-4); border-bottom:1px solid var(--border);
            display:flex; flex-direction:column; gap:6px;
          }
          .review-queue-item:last-child { border-bottom:none; }
          .review-queue-item__meta { display:flex; align-items:center; gap:8px; font-size:14px; }
          .review-queue-item__detail { font-size:12px; color:var(--text-secondary); }
          .review-queue-item__status { font-size:12px; color:var(--text-secondary); }
          .review-queue-item__actions { display:flex; gap:8px; margin-top:4px; }
        </style>
        <div class="settings-shell">
          <div class="settings-shell__header">
            <div class="flex items-center justify-between" style="gap:var(--sp-4);flex-wrap:wrap">
              <div>
                <h2>Administration</h2>
                <p style="margin-top:6px">Control the vendor-assurance platform here: business structure, users, workflow defaults, AI settings, and shared evidence sources stay separate from day-to-day case handling.</p>
              </div>
              <div class="admin-shell-note">Keep vendor case work in the internal portal. Use admin screens only for governed platform changes.</div>
            </div>
            <div class="admin-guidance-strip">
              <span class="admin-guidance-strip__label">Admin guidance</span>
              <strong>Operate through the portals, administer through the console</strong>
              <span>This landing page is for platform control, not assessment work. Open the internal portal for vendor cases and use the console for structure, access, defaults, and evidence libraries.</span>
            </div>
          </div>
          <div class="admin-overview-grid">
            ${[
              UI.dashboardOverviewCard({
                label: 'Visible vendor cases',
                value: vendorCaseSummary.totalCases,
                foot: vendorCaseSummary.totalCases ? 'Cases across onboarding, reassessment, review, and approval stages are visible from the internal workspace.' : 'No vendor cases are visible yet.'
              }),
              UI.dashboardOverviewCard({
                label: 'Waiting on vendor',
                value: vendorCaseSummary.awaitingVendor,
                foot: vendorCaseSummary.awaitingVendor ? 'These cases still need questionnaire completion, clarifications, or evidence from the vendor.' : 'No cases are currently blocked on the vendor.'
              }),
              UI.dashboardOverviewCard({
                label: 'Internal review',
                value: vendorCaseSummary.internalReview,
                foot: vendorCaseSummary.internalReview ? 'GTR and specialist review activity is in progress on these cases.' : 'No cases are currently in internal review.'
              }),
              UI.dashboardOverviewCard({
                label: 'Approvals pending',
                value: vendorCaseSummary.approvalPending,
                foot: vendorCaseSummary.approvalPending ? 'These cases are waiting for approval or exception sign-off.' : 'No approval actions are currently pending.'
              })
            ].join('')}
          </div>
          <div class="grid-2" style="margin-top:var(--sp-6);align-items:start">
            ${UI.dashboardSectionCard({
              title: 'Working portals',
              description: 'Use the operating portals for actual case work. The admin console stays focused on platform control.',
              className: 'dashboard-section-card--spotlight',
              body: `
                <div class="form-help">Internal teams review vendor cases, AI findings, clause recommendations, and approval paths in the internal portal. Vendors respond through their own case-linked workspace.</div>
                <div class="flex items-center gap-3" style="flex-wrap:wrap">
                  <a class="btn btn--primary" href="#/internal/home" id="btn-admin-home-open-workspace">Open Internal Portal</a>
                  <a class="btn btn--secondary" href="#/internal/cases" id="btn-admin-home-open-queue">Open Case Queue</a>
                </div>
              `
            })}
            ${UI.dashboardSectionCard({
              title: 'Administration shortcuts',
              description: 'Core platform-control areas stay one click away without turning the home screen into the old calculator workspace.',
              body: `
                <div class="flex items-center gap-3" style="flex-wrap:wrap">
                  <button type="button" class="btn btn--secondary" id="btn-admin-home-open-console">Open Configuration</button>
                  ${adminQuickActions}
                </div>
                <div class="form-help">Structure, workflow defaults, user access, and document sources stay grouped behind configuration so the top-level experience stays calm.</div>
              `
            })}
          </div>
          <div style="margin-top:var(--sp-6)">
            ${UI.dashboardSectionCard({
              title: 'Platform footprint',
              description: 'A compact read on the current vendor-risk administration footprint.',
              body: `
                <div class="form-help">Structure: ${companyEntities.length} business entit${companyEntities.length === 1 ? 'y' : 'ies'} and ${departmentEntities.length} function${departmentEntities.length === 1 ? '' : 's'} mapped into the admin structure.</div>
                <div class="form-help">Evidence sources: ${docCount} library item${docCount === 1 ? '' : 's'} currently available for AI grounding and analyst reference.</div>
                <div class="form-help">Reassessment cycles: ${vendorCaseSummary.periodicDue} case${vendorCaseSummary.periodicDue === 1 ? '' : 's'} currently marked as periodic reassessment work.</div>
              `
            })}
          </div>
        </div>`);
    },

    bind({ preferredAdminRoute, managedAccounts }) {
      document.getElementById('btn-admin-home-open-workspace')?.addEventListener('click', event => {
        event.preventDefault();
        try {
          sessionStorage.setItem('rq_admin_workspace_preview', '1');
        } catch {}
        Router.navigate('/internal/home');
      });
      document.getElementById('btn-admin-home-open-queue')?.addEventListener('click', event => {
        event.preventDefault();
        Router.navigate('/internal/cases');
      });
      document.getElementById('btn-admin-home-open-console')?.addEventListener('click', () => {
        Router.navigate(preferredAdminRoute);
      });
      document.getElementById('btn-admin-home-users')?.addEventListener('click', () => {
        Router.navigate('/admin/settings/users');
      });
      document.getElementById('btn-admin-home-audit')?.addEventListener('click', () => {
        Router.navigate('/admin/settings/audit');
      });
      document.getElementById('btn-admin-home-bu')?.addEventListener('click', () => {
        Router.navigate('/admin/bu');
      });
      document.getElementById('btn-admin-home-defaults')?.addEventListener('click', () => {
        Router.navigate('/admin/settings/defaults');
      });
      document.getElementById('btn-admin-home-docs')?.addEventListener('click', () => {
        Router.navigate('/admin/docs');
      });
      document.getElementById('btn-admin-logout')?.addEventListener('click', () => { performLogout(); });
      document.querySelectorAll('[data-admin-route]').forEach(button => {
        button.addEventListener('click', event => {
          event.preventDefault();
          const route = button.dataset.adminRoute || '/admin/home';
          if (route.startsWith('/admin/settings/')) {
            const section = route.split('/').pop() || 'org';
            setPreferredAdminSection(section);
          }
          Router.navigate(route);
        });
      });

      async function loadDriftAlerts() {
        const listEl = document.getElementById('admin-drift-alert-list');
        if (!listEl) return;
        try {
          await OrgIntelligenceService?.refresh?.();
          const alerts = OrgIntelligenceService?.buildDriftAlerts?.(3) || [];
          if (!alerts.length) {
            listEl.innerHTML = '<div class="form-help">No material cross-team calibration drift is visible yet.</div>';
            return;
          }
          listEl.innerHTML = alerts.map(alert => `
            <div class="review-queue-item">
              <div class="review-queue-item__meta">
                <strong>${escapeAdminHomeText(alert.scenarioLabel || 'Scenario family')}</strong>
                <span class="badge badge--warning">Drift alert</span>
              </div>
              <div class="review-queue-item__detail">
                ${escapeAdminHomeText(OrgIntelligenceService?.getFieldLabel?.(alert.fieldName) || alert.fieldName)} varies materially across teams.
              </div>
              <div class="review-queue-item__status visible">
                ${escapeAdminHomeText(alert.highBuName)} averages ${escapeAdminHomeText(String(alert.highValue.toFixed(2)))} while ${escapeAdminHomeText(alert.lowBuName)} averages ${escapeAdminHomeText(String(alert.lowValue.toFixed(2)))}.
                This is a ${escapeAdminHomeText(alert.ratio.toFixed(1))}x spread across at least ${escapeAdminHomeText(String(alert.sampleCount))} completed assessments.
              </div>
            </div>
          `).join('');
        } catch {
          listEl.innerHTML = '<div class="form-help">Could not load calibration alerts right now.</div>';
        }
      }

      async function loadReviewQueue() {
        const listEl = document.getElementById('admin-review-queue-list');
        const freshnessEl = document.getElementById('admin-review-queue-freshness');
        if (!listEl) return;
        if (freshnessEl) freshnessEl.innerHTML = renderReviewQueueFreshnessMeta('admin');
        try {
          const sessionToken = typeof AuthService !== 'undefined' && typeof AuthService.getApiSessionToken === 'function'
            ? AuthService.getApiSessionToken()
            : '';
          const currentUsername = AuthService.getCurrentUser()?.username || '';
          const res = await fetch(resolveAdminHomeReviewQueueApiUrl(), {
            headers: { 'x-session-token': sessionToken }
          });
          if (!res.ok) throw new Error('Failed to load queue');
          const { items } = await res.json();
          window.AppReviewQueueSync?.markSurfaceLoaded?.('admin', {
            count: Array.isArray(items) ? items.length : 0
          });
          if (freshnessEl) freshnessEl.innerHTML = renderReviewQueueFreshnessMeta('admin');
          if (!items || !items.length) {
            listEl.innerHTML = '<div class="form-help">No assessments are currently waiting for review.</div>';
            return;
          }
          const queueItemById = new Map((Array.isArray(items) ? items : []).map(item => [String(item?.id || ''), item]));
          const localAssessments = typeof getAssessments === 'function' ? getAssessments() : [];
          const assessmentById = new Map((Array.isArray(localAssessments) ? localAssessments : []).map(item => [String(item?.id || ''), item]));
          listEl.innerHTML = items.map(item => `
            <div class="review-queue-item" data-queue-id="${escapeAdminHomeText(item.id)}"
                 data-assessment-id="${escapeAdminHomeText(item.assessmentId)}"
                 data-results-href="${escapeAdminHomeText(
                   assessmentById.get(String(item.assessmentId || ''))
                     ? ''
                     : (item.sharedAssessment && typeof ShareService !== 'undefined' && typeof ShareService.generateShareURL === 'function'
                         ? (ShareService.generateShareURL(item.sharedAssessment) || '')
                         : '')
                 )}">
              <div class="review-queue-item__meta">
                <strong>${escapeAdminHomeText(resolveAdminHomeScenarioTitle(assessmentById.get(String(item.assessmentId || '')) || item))}</strong>
                <span class="badge ${item.toleranceBreached ? 'badge--danger' : item.nearTolerance ? 'badge--warning' : 'badge--neutral'}">
                  ${item.toleranceBreached ? 'Above tolerance' : item.nearTolerance ? 'Near tolerance' : 'Annual review'}
                </span>
              </div>
              <div class="review-queue-item__detail">
                Submitted by <strong>${escapeAdminHomeText(item.submittedBy)}</strong> ·
                Assigned to <strong>${escapeAdminHomeText(item.assignedReviewerDisplayName || item.assignedReviewerUsername || 'Unassigned')}</strong> ·
                ${escapeAdminHomeText(item.buName || 'Business unit not set')} ·
                ${escapeAdminHomeText(formatAdminHomeDate(item.submittedAt))}
              </div>
              <div class="review-queue-item__status ${item.reviewStatus !== 'pending' ? 'visible' : 'hidden'}">
                Status: <strong>${escapeAdminHomeText(item.reviewStatus)}</strong>
                ${item.reviewNote ? `· ${escapeAdminHomeText(item.reviewNote)}` : ''}
              </div>
              <div class="review-queue-item__actions">
                <button class="btn btn--ghost btn--sm" data-queue-action="view"
                  data-assessment-id="${escapeAdminHomeText(item.assessmentId)}">View Result</button>
                ${(item.currentUserCanReview && (item.reviewStatus === 'pending' || item.reviewStatus === 'escalated')) ? `
                  <button class="btn btn--sm btn--success" data-queue-action="approve"
                    data-queue-id="${escapeAdminHomeText(item.id)}">Approve</button>
                  <button class="btn btn--sm btn--warning" data-queue-action="changes"
                    data-queue-id="${escapeAdminHomeText(item.id)}">Request Changes</button>
                ` : ''}
                ${(item.currentUserCanEscalate && (item.reviewStatus === 'pending' || item.reviewStatus === 'escalated')) ? `
                  <button class="btn btn--sm btn--secondary" data-queue-action="escalate"
                    data-queue-id="${escapeAdminHomeText(item.id)}">Escalate</button>
                ` : ''}
              </div>
            </div>
          `).join('');

          listEl.querySelectorAll('[data-queue-action="view"]').forEach(btn => {
            btn.addEventListener('click', () => {
              const row = btn.closest('.review-queue-item');
              const resultsHref = String(row?.dataset?.resultsHref || '').trim();
              if (resultsHref) {
                const hashIndex = resultsHref.indexOf('#');
                window.location.hash = hashIndex > -1 ? resultsHref.slice(hashIndex) : resultsHref;
                return;
              }
              Router.navigate('/results/' + btn.dataset.assessmentId);
            });
          });

          async function syncLocalReviewDecision(queueItem) {
            if (!queueItem) return;
            const localAssessment = typeof getAssessmentById === 'function'
              ? getAssessmentById(queueItem.assessmentId)
              : null;
            if (localAssessment && typeof updateAssessmentRecord === 'function') {
              updateAssessmentRecord(localAssessment.id, current => ({
                ...current,
                reviewSubmission: {
                  ...(current.reviewSubmission || {}),
                  reviewId: queueItem.id || '',
                  reviewStatus: queueItem.reviewStatus || '',
                  reviewRevision: Math.max(1, Number(queueItem.reviewRevision || 1)),
                  submittedAt: queueItem.submittedAt || 0,
                  submittedByUsername: queueItem.submittedBy || '',
                  submittedByDisplayName: queueItem.submittedByDisplayName || '',
                  assignedReviewerUsername: queueItem.assignedReviewerUsername || '',
                  assignedReviewerDisplayName: queueItem.assignedReviewerDisplayName || '',
                  assignedReviewerRole: queueItem.assignedReviewerRole || '',
                  reviewScope: queueItem.reviewScope || '',
                  reviewNote: queueItem.reviewNote || '',
                  reviewedBy: queueItem.reviewedBy || currentUsername,
                  reviewedAt: queueItem.reviewedAt || Date.now(),
                  updatedAt: queueItem.updatedAt || 0,
                  escalatedTo: queueItem.escalatedTo || '',
                  escalatedBy: queueItem.escalatedBy || '',
                  escalatedAt: queueItem.escalatedAt || 0,
                  currentUserCanReview: queueItem.currentUserCanReview === true,
                  currentUserCanEscalate: queueItem.currentUserCanEscalate === true,
                  currentUserCanView: queueItem.currentUserCanView === true,
                  isAssignedToCurrentUser: queueItem.isAssignedToCurrentUser === true
                },
                reviewDecision: {
                  decision: queueItem.reviewStatus || '',
                  timeToDecide: queueItem.submittedAt && queueItem.reviewedAt
                    ? Math.max(0, Number(queueItem.reviewedAt) - Number(queueItem.submittedAt))
                    : 0,
                  challengedAssumption: queueItem.reviewNote || '',
                  reviewedBy: queueItem.reviewedBy || currentUsername,
                  reviewedAt: queueItem.reviewedAt || Date.now()
                }
              }));
            }
            const localScenarioTitle = resolveAdminHomeScenarioTitle(localAssessment || queueItem);
            await OrgIntelligenceService?.recordReviewDecision?.({
              id: `${queueItem.id}_${queueItem.reviewedAt || Date.now()}`,
              assessmentId: queueItem.assessmentId,
              buId: queueItem.buId || localAssessment?.buId || '',
              buName: queueItem.buName || localAssessment?.buName || '',
              scenarioLensKey: localAssessment?.scenarioLens?.key || '',
              scenarioLensLabel: localAssessment?.scenarioLens?.label || localScenarioTitle,
              scenarioTitle: localScenarioTitle,
              decision: queueItem.reviewStatus || '',
              reviewNote: queueItem.reviewNote || '',
              challengedAssumption: queueItem.reviewStatus === 'changes_requested' ? (queueItem.reviewNote || '') : '',
              reviewedBy: queueItem.reviewedBy || currentUsername,
              reviewedAt: queueItem.reviewedAt || Date.now(),
              submittedAt: queueItem.submittedAt || 0,
              p90Loss: queueItem.p90Loss || localAssessment?.results?.eventLoss?.p90 || 0,
              aleMean: queueItem.aleMean || localAssessment?.results?.ale?.mean || 0
            });
          }

          async function patchQueueItem(id, patch) {
            const nextSessionToken = typeof AuthService !== 'undefined' && typeof AuthService.getApiSessionToken === 'function'
              ? AuthService.getApiSessionToken()
              : '';
            const response = await fetch(resolveAdminHomeReviewQueueApiUrl(), {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                'x-session-token': nextSessionToken
              },
              body: JSON.stringify({
                id,
                reviewedBy: currentUsername,
                expectedReviewRevision: Math.max(1, Number(queueItemById.get(String(id))?.reviewRevision || 1)),
                ...patch
              })
            });
            if (!response.ok) {
              const text = await response.text();
              let parsed = null;
              try {
                parsed = text ? JSON.parse(text) : null;
              } catch {}
              if (typeof AuthService !== 'undefined' && typeof AuthService.buildApiError === 'function') {
                throw AuthService.buildApiError(response, parsed, text || 'Action failed');
              }
              const error = new Error(parsed?.error?.message || 'Action failed');
              error.code = String(parsed?.error?.code || '').trim();
              if (parsed?.latestItem) error.latestItem = parsed.latestItem;
              throw error;
            }
            return response.json();
          }

          async function fetchReviewTargets(action = 'submit') {
            const safeAction = String(action || 'submit').trim().toLowerCase() === 'escalate'
              ? 'escalate'
              : 'submit';
            const nextSessionToken = typeof AuthService !== 'undefined' && typeof AuthService.getApiSessionToken === 'function'
              ? AuthService.getApiSessionToken()
              : '';
            const response = await fetch(resolveAdminHomeReviewQueueApiUrl(`view=targets&action=${encodeURIComponent(safeAction)}`), {
              headers: {
                'x-session-token': nextSessionToken
              }
            });
            if (!response.ok) throw new Error('Could not load review targets.');
            return response.json();
          }

          async function handleQueueActionFailure(error, {
            reviewId = '',
            fallbackMessage = 'Action failed.'
          } = {}) {
            if (error?.code === 'WRITE_CONFLICT' && error.latestItem) {
              queueItemById.set(String(error.latestItem.id || reviewId), error.latestItem);
              await syncLocalReviewDecision(error.latestItem);
              UI.toast('This review item changed in another tab or session. Loaded the latest status.', 'warning');
              await loadReviewQueue();
              return true;
            }
            UI.toast(fallbackMessage, 'danger');
            return false;
          }

          listEl.querySelectorAll('[data-queue-action="approve"]').forEach(btn => {
            btn.addEventListener('click', async () => {
              btn.disabled = true;
              try {
                const { item } = await patchQueueItem(btn.dataset.queueId, { reviewStatus: 'approved' });
                queueItemById.set(String(item?.id || btn.dataset.queueId), item);
                await syncLocalReviewDecision(item);
                window.AppCrossTabSync?.broadcastReviewQueueChanged?.({
                  assessmentId: String(item?.assessmentId || '').trim(),
                  reviewId: String(item?.id || btn.dataset.queueId).trim()
                });
                UI.toast('Assessment approved.', 'success');
                loadReviewQueue();
                loadDriftAlerts();
              } catch (error) {
                if (await handleQueueActionFailure(error, {
                  reviewId: btn.dataset.queueId,
                  fallbackMessage: 'Could not approve. Try again in a moment.'
                })) return;
                btn.disabled = false;
              }
            });
          });

          listEl.querySelectorAll('[data-queue-action="changes"]').forEach(btn => {
            btn.addEventListener('click', () => {
              const modal = UI.modal({
                title: 'Request changes',
                body: `
                  <label for="changes-reason" class="form-label">
                    Reason <span style="color:var(--danger)">*</span>
                  </label>
                  <textarea id="changes-reason" class="form-textarea" rows="4"
                    placeholder="Describe what needs to change before this can be approved…"
                    style="width:100%;margin-bottom:var(--sp-4)"></textarea>
                  <div class="flex gap-3">
                    <button type="button" class="btn btn--primary" id="btn-confirm-changes">
                      Send Request
                    </button>
                    <button type="button" class="btn btn--ghost" id="btn-cancel-changes">Cancel</button>
                  </div>
                `
              });
              document.getElementById('btn-cancel-changes')?.addEventListener('click', () => modal.close());
              document.getElementById('btn-confirm-changes')?.addEventListener('click', async () => {
                const reason = (document.getElementById('changes-reason')?.value || '').trim();
                if (!reason) {
                  UI.toast('Please enter a reason before sending.', 'warning');
                  return;
                }
                const confirmBtn = document.getElementById('btn-confirm-changes');
                if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Sending…'; }
                try {
                  const { item } = await patchQueueItem(btn.dataset.queueId, {
                    reviewStatus: 'changes_requested',
                    reviewNote: reason
                  });
                  queueItemById.set(String(item?.id || btn.dataset.queueId), item);
                  await syncLocalReviewDecision(item);
                  window.AppCrossTabSync?.broadcastReviewQueueChanged?.({
                    assessmentId: String(item?.assessmentId || '').trim(),
                    reviewId: String(item?.id || btn.dataset.queueId).trim()
                  });
                  modal.close();
                  UI.toast('Changes requested.', 'success');
                  loadReviewQueue();
                  loadDriftAlerts();
                } catch (error) {
                  if (await handleQueueActionFailure(error, {
                    reviewId: btn.dataset.queueId,
                    fallbackMessage: 'Could not send request. Try again.'
                  })) {
                    modal.close();
                    return;
                  }
                  if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'Send Request'; }
                }
              });
            });
          });

          listEl.querySelectorAll('[data-queue-action="escalate"]').forEach(btn => {
            btn.addEventListener('click', async () => {
              try {
                const targetState = await fetchReviewTargets('escalate');
                const targets = Array.isArray(targetState?.targets) ? targetState.targets : [];
                if (!targets.length) {
                  UI.toast('No holding-company reviewer is configured yet.', 'warning');
                  return;
                }
                const modal = UI.modal({
                  title: 'Escalate assessment',
                  body: `
                    <label for="admin-review-escalate-target" class="form-label">Escalate to</label>
                    <select id="admin-review-escalate-target" class="form-select" style="width:100%;margin-bottom:var(--sp-4)">
                      ${targets.map(target => `
                        <option value="${escapeAdminHomeText(String(target.username || ''))}" ${target.username === targetState.defaultTargetUsername ? 'selected' : ''}>
                          ${escapeAdminHomeText(String(target.displayName || target.username || ''))}
                        </option>
                      `).join('')}
                    </select>
                    <div class="flex gap-3">
                      <button type="button" class="btn btn--primary" id="btn-admin-confirm-escalate">Escalate</button>
                      <button type="button" class="btn btn--ghost" id="btn-admin-cancel-escalate">Cancel</button>
                    </div>
                  `
                });
                document.getElementById('btn-admin-cancel-escalate')?.addEventListener('click', () => modal.close());
                document.getElementById('btn-admin-confirm-escalate')?.addEventListener('click', async () => {
                  const target = String(document.getElementById('admin-review-escalate-target')?.value || '').trim().toLowerCase();
                  if (!target) {
                    UI.toast('Select a target first.', 'warning');
                    return;
                  }
                  const confirmButton = document.getElementById('btn-admin-confirm-escalate');
                  if (confirmButton) {
                    confirmButton.disabled = true;
                    confirmButton.textContent = 'Escalating…';
                  }
                  try {
                    const { item } = await patchQueueItem(btn.dataset.queueId, {
                      reviewStatus: 'escalated',
                      escalatedTo: target
                    });
                    queueItemById.set(String(item?.id || btn.dataset.queueId), item);
                    await syncLocalReviewDecision(item);
                    window.AppCrossTabSync?.broadcastReviewQueueChanged?.({
                      assessmentId: String(item?.assessmentId || '').trim(),
                      reviewId: String(item?.id || btn.dataset.queueId).trim()
                    });
                    modal.close();
                    UI.toast('Assessment escalated.', 'success');
                    loadReviewQueue();
                    loadDriftAlerts();
                  } catch (error) {
                    if (await handleQueueActionFailure(error, {
                      reviewId: btn.dataset.queueId,
                      fallbackMessage: 'Could not escalate this assessment right now.'
                    })) {
                      modal.close();
                      return;
                    }
                    if (confirmButton) {
                      confirmButton.disabled = false;
                      confirmButton.textContent = 'Escalate';
                    }
                  }
                });
              } catch {
                UI.toast('Could not load the escalation targets right now.', 'danger');
              }
            });
          });
        } catch {
          window.AppReviewQueueSync?.markSurfaceLoadFailed?.('admin', 'Could not refresh the review queue right now.');
          if (freshnessEl) freshnessEl.innerHTML = renderReviewQueueFreshnessMeta('admin');
          listEl.innerHTML = '<div class="form-help">Could not load the review queue right now.</div>';
        }
      }

      if (document.getElementById('admin-review-queue-list')) {
        loadReviewQueue();
        const handleReviewQueueInvalidated = () => {
          const freshnessEl = document.getElementById('admin-review-queue-freshness');
          if (freshnessEl) freshnessEl.innerHTML = renderReviewQueueFreshnessMeta('admin');
          void loadReviewQueue();
        };
        window.addEventListener('rq:review-queue-invalidated', handleReviewQueueInvalidated);
        window.AppShellPage?.registerCleanup?.(() => {
          window.removeEventListener('rq:review-queue-invalidated', handleReviewQueueInvalidated);
        });
      }
      if (document.getElementById('admin-drift-alert-list')) {
        loadDriftAlerts();
      }
    }
  };

  global.AdminHomeSection = AdminHomeSection;
})(window);
