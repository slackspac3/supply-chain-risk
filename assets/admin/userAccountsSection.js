const AdminUserAccountsSection = (() => {
  let latestContext = null;

  function getCurrentActor() {
    return typeof AuthService?.getCurrentUser === 'function'
      ? (AuthService.getCurrentUser() || { role: 'user', username: '', businessUnitEntityId: '', departmentEntityId: '' })
      : { role: 'user', username: '', businessUnitEntityId: '', departmentEntityId: '' };
  }

  function isScopedBuAdmin(actor = getCurrentActor()) {
    return String(actor?.role || '').trim().toLowerCase() === 'bu_admin';
  }

  function getActorBusinessUnitEntityId(actor = getCurrentActor()) {
    return String(actor?.businessUnitEntityId || '').trim();
  }

  function getManagedRoleOptions(actorRole = getCurrentActor().role) {
    if (typeof PortalAccessService !== 'undefined' && PortalAccessService) {
      if (typeof PortalAccessService.listManageableRolesForActor === 'function') {
        return PortalAccessService.listManageableRolesForActor(actorRole);
      }
      if (typeof PortalAccessService.listManageableRoles === 'function') {
        return PortalAccessService.listManageableRoles();
      }
    }
    return [
      { value: 'user', label: 'Standard user', requiresBusinessUnit: true, requiresDepartment: true, departmentOptional: false },
      { value: 'bu_admin', label: 'BU admin', requiresBusinessUnit: true, requiresDepartment: false, departmentOptional: true },
      { value: 'function_admin', label: 'Function admin', requiresBusinessUnit: true, requiresDepartment: true, departmentOptional: false }
    ];
  }

  function getRoleConfig(role = 'user') {
    const safeRole = String(role || 'user').trim();
    const currentActor = getCurrentActor();
    const actorOptions = getManagedRoleOptions(currentActor.role);
    const allOptions = typeof PortalAccessService !== 'undefined' && PortalAccessService && typeof PortalAccessService.listManageableRoles === 'function'
      ? PortalAccessService.listManageableRoles()
      : actorOptions;
    return actorOptions.find(option => option.value === safeRole)
      || allOptions.find(option => option.value === safeRole)
      || actorOptions[0]
      || allOptions[0];
  }

  function renderRoleOptions(selectedRole = 'user', actorRole = getCurrentActor().role) {
    return getManagedRoleOptions(actorRole).map(option => `<option value="${escapeHtml(option.value)}" ${option.value === selectedRole ? 'selected' : ''}>${escapeHtml(option.label)}</option>`).join('');
  }

  function getVisibleCompanyEntities(companyEntities = [], actor = getCurrentActor()) {
    if (!isScopedBuAdmin(actor)) return Array.isArray(companyEntities) ? companyEntities : [];
    const businessUnitEntityId = getActorBusinessUnitEntityId(actor);
    return (Array.isArray(companyEntities) ? companyEntities : [])
      .filter(entity => String(entity?.id || '').trim() === businessUnitEntityId);
  }

  function getVisibleManagedAccounts(managedAccounts = [], actor = getCurrentActor()) {
    if (!isScopedBuAdmin(actor)) return Array.isArray(managedAccounts) ? managedAccounts : [];
    const businessUnitEntityId = getActorBusinessUnitEntityId(actor);
    const actorUsername = String(actor?.username || '').trim().toLowerCase();
    return (Array.isArray(managedAccounts) ? managedAccounts : [])
      .filter(account => String(account?.businessUnitEntityId || '').trim() === businessUnitEntityId
        || String(account?.username || '').trim().toLowerCase() === actorUsername);
  }

  function canActorManageAccount(account = {}, actor = getCurrentActor()) {
    const safeActorRole = String(actor?.role || '').trim().toLowerCase();
    const safeUsername = String(account?.username || '').trim().toLowerCase();
    const actorUsername = String(actor?.username || '').trim().toLowerCase();
    if (safeActorRole === 'bu_admin' && safeUsername === actorUsername) return false;
    if (typeof PortalAccessService !== 'undefined' && PortalAccessService && typeof PortalAccessService.canManageUserRole === 'function') {
      const roleAllowed = PortalAccessService.canManageUserRole(actor.role, account.role);
      if (!roleAllowed) return false;
    }
    if (!isScopedBuAdmin(actor)) return true;
    return String(account?.businessUnitEntityId || '').trim() === getActorBusinessUnitEntityId(actor);
  }

  function getSectionCopy(actor = getCurrentActor()) {
    if (!isScopedBuAdmin(actor)) {
      return {
        description: 'Create users, assign access, and keep role changes aligned with the rest of the platform.',
        metaSuffix: 'managed accounts',
        createSummary: 'A username and random password are generated automatically. New or reset passwords are shown only in this admin session.'
      };
    }
    return {
      description: 'Manage accounts and role assignments for your business unit only. Global platform administration stays with the global admin.',
      metaSuffix: 'BU-scoped accounts',
      createSummary: 'New internal users and vendor contacts are created inside your assigned business unit only. Global and central-review roles stay with the global admin.'
    };
  }

  function getBusinessUnitPrompt(role = 'user') {
    const roleConfig = getRoleConfig(role);
    if (!roleConfig.requiresBusinessUnit) return 'Not required for this role';
    if (role === 'bu_admin') return 'Choose the business unit this BU admin will manage.';
    if (role === 'function_admin') return 'Choose the business unit this function admin sits within.';
    return 'Choose a business unit for this role.';
  }

  function getDepartmentPrompt(role = 'user') {
    const roleConfig = getRoleConfig(role);
    if (!roleConfig.requiresDepartment) return roleConfig.departmentOptional ? 'Not required for this role' : 'Choose function';
    if (role === 'function_admin') return 'Choose the function or department this function admin will own.';
    return 'Choose a function or department for this role.';
  }

  function renderSection({ settings, companyEntities, companyStructure, managedAccounts }) {
    const currentActor = getCurrentActor();
    const visibleCompanyEntities = getVisibleCompanyEntities(companyEntities, currentActor);
    const visibleManagedAccounts = getVisibleManagedAccounts(managedAccounts, currentActor);
    const sectionCopy = getSectionCopy(currentActor);
    const scopedRoleOptions = getManagedRoleOptions(currentActor.role);
    const defaultCreateRole = scopedRoleOptions.some(role => role.value === 'gtr_analyst')
      ? 'gtr_analyst'
      : (scopedRoleOptions[0]?.value || 'user');
    const scopedBusinessUnitEntityId = getActorBusinessUnitEntityId(currentActor);
    const snapshotLoadedAt = Date.now();
    return renderSettingsSection({
      title: 'User Accounts',
      scope: 'admin-settings',
      description: sectionCopy.description,
      meta: `${visibleManagedAccounts.length} ${sectionCopy.metaSuffix}`,
      body: `${UI.adminTableCard({
        title: 'Current users',
        description: 'Review assigned role, business unit, and function before applying access changes.',
        table: `<div class="admin-table-toolbar">
          <input class="form-input" id="admin-user-search" type="search" placeholder="Search name, username, role, BU, or function" style="min-width:min(320px,100%);max-width:420px">
        </div>
        <div class="review-queue-sync-meta review-queue-sync-meta--compact" id="managed-accounts-freshness">
          <span>Directory refreshed ${typeof renderLiveTimestampValue === 'function'
            ? renderLiveTimestampValue(snapshotLoadedAt, { tagName: 'strong', mode: 'absolute', includeSeconds: true, fallback: 'Unknown time' })
            : `<strong>${escapeHtml(typeof formatOperationalDateTime === 'function' ? formatOperationalDateTime(snapshotLoadedAt, { includeSeconds: true, fallback: 'Unknown time' }) : 'Unknown time')}</strong>`}</span>
          <span>Data age ${typeof renderLiveTimestampValue === 'function'
            ? renderLiveTimestampValue(snapshotLoadedAt, { tagName: 'strong', mode: 'relative', fallback: 'just now', staleAfterMs: 120000, staleClass: 'live-timestamp--stale' })
            : `<strong>${escapeHtml(typeof formatRelativePilotTime === 'function' ? formatRelativePilotTime(snapshotLoadedAt, 'just now') : 'just now')}</strong>`}</span>
          <span>This table reflects the latest confirmed shared account directory loaded for this admin session.</span>
        </div>
        <table class="data-table data-table--dense data-table--workbench">
          <thead>
            <tr>
              <th>User</th>
              <th>Access role</th>
              <th>Scope</th>
              <th>Issued password</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${visibleManagedAccounts.length ? visibleManagedAccounts.map(account => {
              const departmentsForAccount = getDepartmentEntities(companyStructure, account.businessUnitEntityId || '');
              const accountIsEditable = canActorManageAccount(account, currentActor);
              return `
              <tr class="managed-account-row" data-username="${escapeHtml(String(account.username || ''))}">
                <td>
                  <div class="table-primary-cell">
                    <strong>${escapeHtml(String(account.displayName || 'User'))}</strong>
                    <span><code>${escapeHtml(String(account.username || ''))}</code></span>
                  </div>
                </td>
                <td>
                  ${accountIsEditable
                    ? `<select class="form-select form-select--sm account-role-select" data-username="${escapeHtml(String(account.username || ''))}">
                    ${renderRoleOptions(account.role || 'user', currentActor.role)}
                  </select>`
                    : `<div class="table-primary-cell"><strong>${escapeHtml(getRoleConfig(account.role || 'user')?.label || account.role || 'User')}</strong><span>Protected by global admin policy</span></div>`}
                </td>
                <td>
                  ${accountIsEditable ? `<div class="table-scope-stack">
                    ${(() => {
                      const roleConfig = getRoleConfig(account.role || 'user');
                      const departmentPlaceholder = roleConfig.requiresDepartment ? 'Choose function' : getDepartmentPrompt(account.role || 'user');
                      return `
                    <select class="form-select form-select--sm account-bu-select" data-username="${escapeHtml(String(account.username || ''))}" ${isScopedBuAdmin(currentActor) ? 'disabled' : ''}>
                      <option value="">Choose BU</option>
                      ${visibleCompanyEntities.map(entity => `<option value="${escapeHtml(String(entity.id || ''))}" ${entity.id === (account.businessUnitEntityId || '') ? 'selected' : ''}>${escapeHtml(String(entity.name || 'Unnamed entity'))}</option>`).join('')}
                    </select>
                    <select class="form-select form-select--sm account-department-select" data-username="${escapeHtml(String(account.username || ''))}">
                      <option value="">${escapeHtml(departmentPlaceholder)}</option>
                      ${departmentsForAccount.map(entity => `<option value="${escapeHtml(String(entity.id || ''))}" ${entity.id === (account.departmentEntityId || '') ? 'selected' : ''}>${escapeHtml(String(entity.name || 'Unnamed entity'))}</option>`).join('')}
                    </select>
                    `;
                    })()}
                  </div>` : `<div class="table-scope-stack"><span>${escapeHtml(visibleCompanyEntities.find(entity => entity.id === account.businessUnitEntityId)?.name || 'No business unit assigned')}</span><span>${escapeHtml(departmentsForAccount.find(entity => entity.id === account.departmentEntityId)?.name || 'No function assigned')}</span></div>`}
                </td>
                <td><code>${escapeHtml(String(AppState.adminVisiblePasswords[account.username] || 'Reset to issue'))}</code></td>
                <td class="table-actions-cell">
                  ${accountIsEditable ? `<div class="table-actions-row">
                    <button class="btn btn--secondary btn--sm btn-apply-user-access" data-username="${escapeHtml(String(account.username || ''))}" data-display-name="${escapeHtml(String(account.displayName || 'User'))}" type="button">Apply Access</button>
                    <details class="results-actions-disclosure dashboard-row-overflow" style="display:inline-flex">
                      <summary class="btn btn--ghost btn--sm">More</summary>
                      <div class="results-actions-disclosure-menu">
                        <button class="btn btn--secondary btn--sm btn-reset-user-password" data-username="${escapeHtml(String(account.username || ''))}" data-display-name="${escapeHtml(String(account.displayName || 'User'))}" type="button">Reset Password</button>
                        <button class="btn btn--secondary btn--sm btn-reset-user-account" data-username="${escapeHtml(String(account.username || ''))}" data-display-name="${escapeHtml(String(account.displayName || 'User'))}" type="button">Reset User</button>
                        <button class="btn btn--secondary btn--sm btn-delete-user-account" data-username="${escapeHtml(String(account.username || ''))}" data-display-name="${escapeHtml(String(account.displayName || 'User'))}" type="button">Delete User</button>
                      </div>
                    </details>
                  </div>` : '<span class="form-help">Global-admin managed</span>'}
                </td>
              </tr>`;
            }).join('') : '<tr><td colspan="5"><div class="empty-state"><strong>No managed users yet.</strong><div style="margin-top:8px">Create the first pilot user below, then return here to assign their role, business-unit scope, and function ownership.</div></div></td></tr>'}
          </tbody>
        </table>`
      })}
      <details class="dashboard-disclosure card mt-4">
        <summary>Create a user <span class="badge badge--neutral">Optional</span></summary>
        <div class="dashboard-disclosure-copy">Create a new account only when you need to add someone to the platform.</div>
        <div class="dashboard-disclosure-body">
          <div class="card" style="padding:var(--sp-4);background:var(--bg-canvas)">
            <div class="grid-4 mt-1">
              <div class="form-group">
                <label class="form-label" for="admin-new-user-name">Display name</label>
                <input class="form-input" id="admin-new-user-name" placeholder="e.g. Sara Finance">
              </div>
              <div class="form-group">
                <label class="form-label" for="admin-new-user-role">Role</label>
                <select class="form-select" id="admin-new-user-role">
                  ${renderRoleOptions(defaultCreateRole, currentActor.role)}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="admin-new-user-bu">Business unit</label>
                <select class="form-select" id="admin-new-user-bu" ${isScopedBuAdmin(currentActor) ? 'disabled' : ''}>
                  <option value="">Choose BU</option>
                  ${visibleCompanyEntities.map(entity => `<option value="${escapeHtml(String(entity.id || ''))}" ${entity.id === scopedBusinessUnitEntityId ? 'selected' : ''}>${escapeHtml(String(entity.name || 'Unnamed entity'))}</option>`).join('')}
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="admin-new-user-department">Function / department</label>
                <select class="form-select" id="admin-new-user-department"><option value="">Not required for this role</option></select>
              </div>
            </div>
            <div class="flex items-center gap-3 mt-4" style="flex-wrap:wrap">
              <button class="btn btn--secondary" id="btn-admin-add-user">Add User</button>
              <span class="form-help" id="admin-new-user-result">${AppState.adminNewUserStatus || sectionCopy.createSummary}</span>
            </div>
          </div>
        </div>
      </details>
      ${typeof AuthService?.isGlobalAdminAuthenticated === 'function' && !AuthService.isGlobalAdminAuthenticated() ? '' : `<details class="dashboard-disclosure card mt-4">
        <summary>Admin account tools <span class="badge badge--neutral">Advanced</span></summary>
        <div class="dashboard-disclosure-copy">Normal signed-in admin actions use your current session. The secret below is a current-tab fallback for protected account actions only.</div>
        <div class="dashboard-disclosure-body">
          <div class="card" style="padding:var(--sp-4);background:var(--bg-canvas)">
            <div class="grid-2 mt-1">
              <div class="form-group">
                <label class="form-label" for="admin-api-secret">Admin action secret</label>
                <input class="form-input" id="admin-api-secret" type="password" placeholder="Paste the admin action secret for this tab if needed" value="${escapeHtml(String(AuthService.getAdminApiSecret() || ''))}">
                <span class="form-help">Saved only for this tab. Signed-in admin requests use the session token first and fall back to the secret only when needed.</span>
              </div>
            </div>
            <div class="flex items-center gap-3 mt-3" style="flex-wrap:wrap">
              <button class="btn btn--secondary" id="btn-save-admin-secret" type="button">Save Admin Secret</button>
              <button class="btn btn--ghost" id="btn-clear-admin-secret" type="button">Clear Admin Secret</button>
              <button class="btn btn--secondary" id="btn-test-users-store" type="button">Check Account Sync</button>
              <span class="form-help" id="admin-users-store-status">Checks whether account changes are available for this admin session.</span>
            </div>
          </div>
        </div>
      </details>`}
      <div class="form-help mt-3">Reset clears this user's saved working state and returns them to a first-time setup experience.</div>`
    });
  }
  function _renderAdminNewUserDepartments(companyStructure) {
    const currentActor = getCurrentActor();
    const buEl = document.getElementById('admin-new-user-bu');
    const buId = buEl?.value || '';
    const role = document.getElementById('admin-new-user-role')?.value || 'user';
    const roleConfig = getRoleConfig(role);
    const departmentEl = document.getElementById('admin-new-user-department');
    if (!departmentEl) return;
    if (buEl) {
      if (isScopedBuAdmin(currentActor)) {
        buEl.value = getActorBusinessUnitEntityId(currentActor);
        buEl.disabled = true;
      } else {
        if (!roleConfig.requiresBusinessUnit) buEl.value = '';
        buEl.disabled = !roleConfig.requiresBusinessUnit;
      }
    }
    const selectedBusinessUnitEntityId = isScopedBuAdmin(currentActor) ? getActorBusinessUnitEntityId(currentActor) : buId;
    const departments = getDepartmentEntities(companyStructure, selectedBusinessUnitEntityId);
    const placeholder = roleConfig.requiresDepartment
      ? (departments.length ? 'Choose function' : 'No functions configured')
      : getDepartmentPrompt(role);
    departmentEl.innerHTML = `<option value="">${escapeHtml(String(placeholder))}</option>${departments.map(entity => `<option value="${escapeHtml(String(entity.id || ''))}">${escapeHtml(String(entity.name || 'Unnamed entity'))}</option>`).join('')}`;
    departmentEl.disabled = !roleConfig.requiresDepartment || !buId || !departments.length;
  }


  function _selectedLabel(selectEl) {
    return selectEl?.options?.[selectEl.selectedIndex]?.textContent?.trim() || '';
  }

  function _describeAccessChange(currentAccount, nextAssignment, row) {
    const roleConfig = getRoleConfig(nextAssignment.role);
    const roleLabel = roleConfig.label;
    const buLabel = _selectedLabel(row?.querySelector('.account-bu-select')) || 'No business unit selected';
    const departmentLabel = roleConfig.requiresDepartment
      ? (_selectedLabel(row?.querySelector('.account-department-select')) || 'No function selected')
      : getDepartmentPrompt(nextAssignment.role);
    const changed = [];
    if ((currentAccount.role || 'user') !== nextAssignment.role) changed.push(`Role: ${currentAccount.role || 'user'} → ${nextAssignment.role}`);
    if ((currentAccount.businessUnitEntityId || '') !== (nextAssignment.businessUnitEntityId || '')) changed.push('Business unit scope will change.');
    if ((String(currentAccount.departmentEntityId || '').trim()) !== (String(nextAssignment.departmentEntityId || '').trim())) changed.push('Function ownership will change.');
    return { roleLabel, buLabel, departmentLabel, changed };
  }

  function _renderManagedAccountDepartmentOptions(row, companyStructure) {
    if (!row) return;
    const currentActor = getCurrentActor();
    const role = row.querySelector('.account-role-select')?.value || 'user';
    const roleConfig = getRoleConfig(role);
    const buEl = row.querySelector('.account-bu-select');
    if (buEl) {
      if (isScopedBuAdmin(currentActor)) {
        buEl.value = getActorBusinessUnitEntityId(currentActor);
        buEl.disabled = true;
      } else {
        if (!roleConfig.requiresBusinessUnit) buEl.value = '';
        buEl.disabled = !roleConfig.requiresBusinessUnit;
      }
    }
    const buId = isScopedBuAdmin(currentActor) ? getActorBusinessUnitEntityId(currentActor) : (buEl?.value || '');
    const departmentEl = row.querySelector('.account-department-select');
    if (!departmentEl) return;
    const departments = getDepartmentEntities(companyStructure, buId);
    const currentValue = departmentEl.value || departmentEl.dataset.currentValue || '';
    const placeholder = roleConfig.requiresDepartment
      ? (departments.length ? 'Choose function' : 'No functions configured')
      : getDepartmentPrompt(role);
    departmentEl.innerHTML = `<option value="">${escapeHtml(String(placeholder))}</option>${departments.map(entity => `<option value="${escapeHtml(String(entity.id || ''))}" ${entity.id === currentValue ? 'selected' : ''}>${escapeHtml(String(entity.name || 'Unnamed entity'))}</option>`).join('')}`;
    departmentEl.disabled = !roleConfig.requiresDepartment || !buId || !departments.length;
    if (!departments.some(entity => entity.id === currentValue)) departmentEl.value = '';
  }

  async function _refreshManagedAccountSnapshot() {
    const [accounts] = await Promise.all([
      typeof AuthService?.refreshManagedAccounts === 'function'
        ? AuthService.refreshManagedAccounts().catch(() => (typeof AuthService?.getManagedAccounts === 'function' ? AuthService.getManagedAccounts() : []))
        : Promise.resolve(typeof AuthService?.getManagedAccounts === 'function' ? AuthService.getManagedAccounts() : []),
      typeof loadSharedAdminSettings === 'function'
        ? loadSharedAdminSettings().catch(() => null)
        : Promise.resolve(null)
    ]);
    return Array.isArray(accounts) ? accounts : [];
  }

  function _broadcastManagedAccountChange(detail = {}) {
    window.AppCrossTabSync?.broadcastManagedAccountsChanged?.({
      updatedAt: Date.now(),
      ...detail
    });
  }

  async function _applyManagedAccountAccess(button) {
    const currentActor = getCurrentActor();
    const username = button.dataset.username || '';
    const displayName = button.dataset.displayName || username;
    const row = button.closest('.managed-account-row');
    if (!row) return false;
    const role = row.querySelector('.account-role-select')?.value || 'user';
    const roleConfig = getRoleConfig(role);
    const businessUnitEntityId = row.querySelector('.account-bu-select')?.value || '';
    const departmentEntityId = row.querySelector('.account-department-select')?.value || '';
    if (roleConfig.requiresBusinessUnit && !businessUnitEntityId) {
      UI.toast(getBusinessUnitPrompt(role), 'warning');
      return false;
    }
    if (roleConfig.requiresDepartment && !departmentEntityId) {
      UI.toast(getDepartmentPrompt(role), 'warning');
      return false;
    }
    button.disabled = true;
    button.textContent = 'Applying…';
    const currentSettings = getAdminSettings();
    const currentAccount = getManagedAccountsForAdmin(currentSettings).find(account => account.username === username) || { username, role: 'user', businessUnitEntityId: '', departmentEntityId: '' };
    if (!canActorManageAccount(currentAccount, currentActor)) {
      UI.toast('This account is managed by the global admin.', 'warning');
      button.disabled = false;
      button.textContent = 'Apply Access';
      return false;
    }
    const nextAssignment = {
      role,
      businessUnitEntityId: roleConfig.requiresBusinessUnit
        ? (isScopedBuAdmin(currentActor) ? getActorBusinessUnitEntityId(currentActor) : businessUnitEntityId)
        : '',
      departmentEntityId: roleConfig.requiresDepartment ? departmentEntityId : ''
    };
    const nextSettings = applyManagedAccountAssignmentToSettings(currentAccount, nextAssignment, currentSettings);
    const changeSummary = _describeAccessChange(currentAccount, nextAssignment, row);
    if (changeSummary.changed.length) {
      const confirmed = await UI.confirm(`Apply access for ${displayName}?

Role: ${changeSummary.roleLabel}
Business unit: ${changeSummary.buLabel}
Function: ${changeSummary.departmentLabel}

${changeSummary.changed.join(' ')}`);
      if (!confirmed) return false;
    }
    try {
      await AuthService.adminUpdateManagedAccount(username, nextAssignment);
      const saved = await saveAdminSettings(nextSettings);
      if (!saved) {
        AppState.adminNewUserStatus = 'Access changed on the account service, but shared platform settings could not be saved. Reload the latest settings and try again.';
        const resultEl = document.getElementById('admin-new-user-result');
        if (resultEl) resultEl.textContent = AppState.adminNewUserStatus;
        UI.toast('Shared access settings were not saved.', 'warning');
        button.disabled = false;
        button.textContent = 'Apply Access';
        return false;
      }
      const refreshedAccounts = await _refreshManagedAccountSnapshot();
      const verifiedAccount = refreshedAccounts.find(account => String(account?.username || '').trim().toLowerCase() === username);
      if (!verifiedAccount) {
        throw new Error('Updated account could not be reloaded after saving.');
      }
    } catch (error) {
      AppState.adminNewUserStatus = 'User access could not be updated. Check the assigned role and scope, then try again.';
      const resultEl = document.getElementById('admin-new-user-result');
      if (resultEl) resultEl.textContent = AppState.adminNewUserStatus;
      UI.toast('User update failed.', 'danger');
      button.disabled = false;
      button.textContent = 'Apply Access';
      return false;
    }
    row.dataset.dirty = 'false';
    button.textContent = 'Applied';
    _broadcastManagedAccountChange({ username, action: 'access_updated' });
    AppState.adminNewUserStatus = `Applied ${getRoleConfig(role).label} access for ${displayName}.`;
    const resultEl = document.getElementById('admin-new-user-result');
    if (resultEl) resultEl.textContent = AppState.adminNewUserStatus;
    return true;
  }

  async function applyPendingChanges() {
    const rows = Array.from(document.querySelectorAll('.managed-account-row')).filter(row => row.dataset.dirty === 'true');
    for (const row of rows) {
      const button = row.querySelector('.btn-apply-user-access');
      if (!button) continue;
      const ok = await _applyManagedAccountAccess(button);
      if (!ok) return false;
    }
    return true;
  }

  function bind(context) {
    latestContext = context;
    const { companyStructure, rerenderCurrentAdminSection } = context;
    if (typeof clearManagedAccountsStaleNotice === 'function') clearManagedAccountsStaleNotice();
    document.getElementById('admin-new-user-bu')?.addEventListener('change', () => _renderAdminNewUserDepartments(companyStructure));
    document.getElementById('admin-new-user-role')?.addEventListener('change', () => _renderAdminNewUserDepartments(companyStructure));
    _renderAdminNewUserDepartments(companyStructure);

    const handleManagedAccountsInvalidated = (event) => {
      const detail = event?.detail && typeof event.detail === 'object' ? event.detail : {};
      const hasDirtyRows = Array.from(document.querySelectorAll('.managed-account-row')).some(row => row.dataset.dirty === 'true');
      if (hasDirtyRows) {
        if (typeof setManagedAccountsStaleNotice === 'function') {
          setManagedAccountsStaleNotice({
            username: detail.username || '',
            updatedAt: Number(detail.updatedAt || Date.now()),
            detectedAt: Date.now(),
            action: detail.action || ''
          });
        }
        UI.toast('Managed accounts changed in another tab. Finish or discard local edits, then reload this section.', 'warning', 5000);
        return;
      }
      if (typeof clearManagedAccountsStaleNotice === 'function') clearManagedAccountsStaleNotice();
      rerenderCurrentAdminSection();
    };
    window.addEventListener('rq:managed-accounts-invalidated', handleManagedAccountsInvalidated);
    window.AppShellPage?.registerCleanup?.(() => {
      window.removeEventListener('rq:managed-accounts-invalidated', handleManagedAccountsInvalidated);
    });


    document.getElementById('admin-user-search')?.addEventListener('input', event => {
      const query = String(event.target.value || '').trim().toLowerCase();
      document.querySelectorAll('.managed-account-row').forEach(row => {
        const haystack = [
          row.children[0]?.textContent || '',
          row.children[1]?.textContent || '',
          row.querySelector('.account-role-select option:checked')?.textContent || '',
          row.querySelector('.account-bu-select option:checked')?.textContent || '',
          row.querySelector('.account-department-select option:checked')?.textContent || ''
        ].join(' ').toLowerCase();
        row.style.display = !query || haystack.includes(query) ? '' : 'none';
      });
    });

    document.querySelectorAll('.managed-account-row').forEach(row => {
      const markDirty = () => {
        row.dataset.dirty = 'true';
        const button = row.querySelector('.btn-apply-user-access');
        if (button) {
          button.disabled = false;
          button.textContent = 'Apply Access';
        }
      };
      row.querySelector('.account-bu-select')?.addEventListener('change', () => { _renderManagedAccountDepartmentOptions(row, companyStructure); markDirty(); });
      row.querySelector('.account-role-select')?.addEventListener('change', () => { _renderManagedAccountDepartmentOptions(row, companyStructure); markDirty(); });
      row.querySelector('.account-department-select')?.addEventListener('change', markDirty);
      row.dataset.dirty = 'false';
      _renderManagedAccountDepartmentOptions(row, companyStructure);
    });

    document.querySelectorAll('.btn-reset-user-account').forEach(button => {
      button.addEventListener('click', async () => {
        const username = button.dataset.username || '';
        const displayName = button.dataset.displayName || username;
        if (!await UI.confirm(`Reset ${displayName} to a first-time user state? This will clear their stored context, memory, assessments, and session settings in this browser.`)) return;
        try {
          await clearUserPersistentState(username);
          _broadcastManagedAccountChange({ username, action: 'state_reset' });
          UI.toast(`${displayName} was reset.`, 'success');
          rerenderCurrentAdminSection();
        } catch (error) {
          UI.toast('User reset failed. Try again in a moment.', 'danger');
        }
      });
    });

    document.querySelectorAll('.btn-reset-user-password').forEach(button => {
      button.addEventListener('click', async () => {
        const username = button.dataset.username || '';
        const displayName = button.dataset.displayName || username;
        if (!await UI.confirm(`Issue a new password for ${displayName}? The old password will stop working.`)) return;
        try {
          const result = await AuthService.resetManagedPassword(username);
          const refreshedAccounts = await _refreshManagedAccountSnapshot();
          const verifiedAccount = refreshedAccounts.find(account => String(account?.username || '').trim().toLowerCase() === username);
          if (!verifiedAccount) {
            throw new Error('Managed account could not be reloaded after password reset.');
          }
          AppState.adminVisiblePasswords[username] = result.password || '';
          AppState.adminNewUserStatus = `Password reset for ${displayName}: username ${username} / password ${result.password}`;
          _broadcastManagedAccountChange({ username, action: 'password_reset' });
          UI.toast(`Password reset for ${username}.`, 'success');
          rerenderCurrentAdminSection();
        } catch (error) {
          AppState.adminNewUserStatus = 'Password could not be reset right now. Try again in a moment.';
          const resultEl = document.getElementById('admin-new-user-result');
          if (resultEl) resultEl.textContent = AppState.adminNewUserStatus;
          UI.toast('Password reset failed.', 'danger');
        }
      });
    });

    document.querySelectorAll('.btn-apply-user-access').forEach(button => {
      button.addEventListener('click', async () => {
        const ok = await _applyManagedAccountAccess(button);
        if (!ok) return;
        UI.toast(`Updated access for ${button.dataset.displayName || button.dataset.username || 'user'}.`, 'success');
        rerenderCurrentAdminSection();
      });
    });

    document.querySelectorAll('.btn-delete-user-account').forEach(button => {
      button.addEventListener('click', async () => {
        const username = button.dataset.username || '';
        const displayName = button.dataset.displayName || username;
        if (!await UI.confirm(`Delete ${displayName}? This removes their account, saved state, and any BU or function ownership assigned to them.`)) return;
        try {
          const currentSettings = getAdminSettings();
          const clearedSettings = {
            ...currentSettings,
            companyStructure: (Array.isArray(currentSettings.companyStructure) ? currentSettings.companyStructure : []).map(node => node.ownerUsername === username ? { ...node, ownerUsername: '' } : node)
          };
          await AuthService.deleteManagedAccount(username);
          const saved = await saveAdminSettings(clearedSettings);
          if (!saved) {
            UI.toast('The account was removed, but shared ownership settings could not be saved.', 'warning');
            return;
          }
          await clearUserPersistentState(username);
          const refreshedAccounts = await _refreshManagedAccountSnapshot();
          const accountStillExists = refreshedAccounts.some(account => String(account?.username || '').trim().toLowerCase() === username);
          if (accountStillExists) {
            throw new Error('Deleted account still appears in the shared directory.');
          }
          _broadcastManagedAccountChange({ username, action: 'deleted' });
          UI.toast(`${displayName} deleted.`, 'success');
          rerenderCurrentAdminSection();
        } catch (error) {
          UI.toast('User could not be deleted right now.', 'danger');
        }
      });
    });

    document.getElementById('btn-save-admin-secret')?.addEventListener('click', async () => {
      const secret = document.getElementById('admin-api-secret')?.value || '';
      AuthService.setAdminApiSecret(secret);
      if (!secret) {
        UI.toast('Admin action secret cleared for this tab.', 'success');
        return;
      }
      try {
        await syncSharedAdminSettings(getAdminSettings());
        UI.toast('Admin action secret saved for this tab and current admin settings synced.', 'success');
      } catch (error) {
        UI.toast('Admin action secret was saved for this tab, but the latest platform settings could not be refreshed right now.', 'warning');
      }
    });

    document.getElementById('btn-clear-admin-secret')?.addEventListener('click', () => {
      AuthService.setAdminApiSecret('');
      const input = document.getElementById('admin-api-secret');
      if (input) input.value = '';
      UI.toast('Admin action secret cleared for this tab.', 'success');
    });

    document.getElementById('btn-test-users-store')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-test-users-store');
      const statusEl = document.getElementById('admin-users-store-status');
      if (!btn || !statusEl) return;
      btn.disabled = true;
      btn.textContent = 'Checking…';
      statusEl.textContent = 'Checking whether account updates are available for this admin session…';
      const result = await AuthService.testUsersStoreHealth();
      if (result.ok) {
        if (result.writable) {
          statusEl.textContent = 'Account changes are available and should appear across the platform.';
          UI.toast('Account sync is available.', 'success');
        } else {
          statusEl.textContent = 'Account information is reachable, but changes cannot be saved right now.';
          UI.toast('Account sync is reachable but not writable.', 'warning');
        }
      } else {
        statusEl.textContent = 'The platform could not confirm account sync right now. Try again in a moment.';
        UI.toast('Account sync check failed.', 'warning');
      }
      btn.disabled = false;
      btn.textContent = 'Check Account Sync';
    });

    document.getElementById('btn-admin-add-user')?.addEventListener('click', async () => {
      const currentActor = getCurrentActor();
      const button = document.getElementById('btn-admin-add-user');
      const resultEl = document.getElementById('admin-new-user-result');
      const displayName = document.getElementById('admin-new-user-name').value.trim();
      const role = document.getElementById('admin-new-user-role').value.trim() || 'user';
      const roleConfig = getRoleConfig(role);
      const businessUnitEntityId = isScopedBuAdmin(currentActor)
        ? getActorBusinessUnitEntityId(currentActor)
        : document.getElementById('admin-new-user-bu').value.trim();
      const departmentEntityId = document.getElementById('admin-new-user-department').value.trim();
      if (!displayName) {
        AppState.adminNewUserStatus = 'Enter a display name for the new user.';
        resultEl.textContent = AppState.adminNewUserStatus;
        UI.toast(AppState.adminNewUserStatus, 'warning');
        return;
      }
      if (roleConfig.requiresBusinessUnit && !businessUnitEntityId) {
        AppState.adminNewUserStatus = getBusinessUnitPrompt(role);
        resultEl.textContent = AppState.adminNewUserStatus;
        UI.toast(AppState.adminNewUserStatus, 'warning');
        return;
      }
      if (roleConfig.requiresDepartment && !departmentEntityId) {
        AppState.adminNewUserStatus = getDepartmentPrompt(role);
        resultEl.textContent = AppState.adminNewUserStatus;
        UI.toast(AppState.adminNewUserStatus, 'warning');
        return;
      }
      const roleLabel = roleConfig.label;
      const buLabel = roleConfig.requiresBusinessUnit
        ? (document.getElementById('admin-new-user-bu')?.selectedOptions?.[0]?.textContent?.trim() || 'No business unit selected')
        : 'Not required for this role';
      const departmentLabel = roleConfig.requiresDepartment
        ? (document.getElementById('admin-new-user-department')?.selectedOptions?.[0]?.textContent?.trim() || 'No function selected')
        : getDepartmentPrompt(role);
      const confirmed = await UI.confirm(`Create ${displayName}?

Role: ${roleLabel}
Business unit: ${buLabel}
Function: ${departmentLabel}`);
      if (!confirmed) return;
      button.disabled = true;
      button.textContent = 'Creating…';
      resultEl.textContent = 'Creating shared user account…';
      try {
        const account = await AuthService.createManagedAccount({
          displayName,
          role,
          businessUnitEntityId: roleConfig.requiresBusinessUnit ? businessUnitEntityId : '',
          departmentEntityId: roleConfig.requiresDepartment ? departmentEntityId : ''
        });
        const nextSettings = applyManagedAccountAssignmentToSettings(account, {
          role: account.role,
          businessUnitEntityId: account.businessUnitEntityId,
          departmentEntityId: account.departmentEntityId
        }, getAdminSettings());
        const saved = await saveAdminSettings(nextSettings);
        if (!saved) {
          AppState.adminNewUserStatus = 'The account was created, but shared ownership settings could not be saved. Reload the latest settings and reapply the assignment.';
          resultEl.textContent = AppState.adminNewUserStatus;
          UI.toast('Shared access settings were not saved.', 'warning');
          button.disabled = false;
          button.textContent = 'Add User';
          return;
        }
        const refreshedAccounts = await _refreshManagedAccountSnapshot();
        const verifiedAccount = refreshedAccounts.find(entry => String(entry?.username || '').trim().toLowerCase() === String(account.username || '').trim().toLowerCase());
        if (!verifiedAccount) {
          throw new Error('Managed account could not be reloaded after creation.');
        }
        AppState.adminVisiblePasswords[account.username] = account.password || '';
        AppState.adminNewUserStatus = `Created ${account.displayName}: username ${account.username} / password ${account.password}`;
        _broadcastManagedAccountChange({ username: account.username, action: 'created' });
        UI.toast(`Created ${account.username}.`, 'success');
        rerenderCurrentAdminSection();
      } catch (error) {
        const message = String(error?.message || '').trim();
        AppState.adminNewUserStatus = message
          ? `User could not be created: ${message}`
          : 'User could not be created right now. Check the assigned role and scope, then try again.';
        resultEl.textContent = AppState.adminNewUserStatus;
        UI.toast(AppState.adminNewUserStatus, 'danger');
        button.disabled = false;
        button.textContent = 'Add User';
      }
    });
  }

  return {
    renderSection,
    bind,
    applyPendingChanges
  };
})();
