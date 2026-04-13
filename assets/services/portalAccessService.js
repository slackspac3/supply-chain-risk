(function(globalScope) {
  'use strict';

  const GLOBAL_ADMIN_MANAGED_ROLE_VALUES = new Set([
    'user',
    'bu_admin',
    'function_admin',
    'gtr_analyst',
    'reviewer',
    'approver',
    'privacy',
    'legal',
    'procurement',
    'vendor_contact'
  ]);
  const BU_ADMIN_MANAGED_ROLE_VALUES = new Set(['user', 'function_admin', 'vendor_contact']);
  const ADMIN_PORTAL_ROLES = new Set(['admin', 'bu_admin']);
  const ADMIN_ROUTE_ACCESS = Object.freeze({
    '/admin/home': Object.freeze(['admin', 'bu_admin']),
    '/admin/settings': Object.freeze(['admin', 'bu_admin']),
    '/admin/settings/org': Object.freeze(['admin', 'bu_admin']),
    '/admin/settings/company': Object.freeze(['admin']),
    '/admin/settings/defaults': Object.freeze(['admin']),
    '/admin/settings/governance': Object.freeze(['admin']),
    '/admin/settings/feedback': Object.freeze(['admin']),
    '/admin/settings/access': Object.freeze(['admin']),
    '/admin/settings/users': Object.freeze(['admin', 'bu_admin']),
    '/admin/settings/audit': Object.freeze(['admin', 'bu_admin']),
    '/admin/bu': Object.freeze(['admin', 'bu_admin']),
    '/admin/docs': Object.freeze(['admin'])
  });

  const MANAGED_ROLE_OPTIONS = Object.freeze([
    {
      value: 'user',
      label: 'Standard user',
      portalKind: 'internal',
      requiresBusinessUnit: true,
      requiresDepartment: true,
      departmentOptional: false,
      scopeLabel: 'Business unit and function'
    },
    {
      value: 'bu_admin',
      label: 'BU admin',
      portalKind: 'admin',
      requiresBusinessUnit: true,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Business unit administration'
    },
    {
      value: 'function_admin',
      label: 'Function admin',
      portalKind: 'internal',
      requiresBusinessUnit: true,
      requiresDepartment: true,
      departmentOptional: false,
      scopeLabel: 'Business unit and function'
    },
    {
      value: 'gtr_analyst',
      label: 'GTR analyst',
      portalKind: 'internal',
      requiresBusinessUnit: false,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Central review'
    },
    {
      value: 'reviewer',
      label: 'Reviewer',
      portalKind: 'internal',
      requiresBusinessUnit: false,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Central review'
    },
    {
      value: 'approver',
      label: 'Approver',
      portalKind: 'internal',
      requiresBusinessUnit: false,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Central decision'
    },
    {
      value: 'privacy',
      label: 'Privacy',
      portalKind: 'internal',
      requiresBusinessUnit: false,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Specialist review'
    },
    {
      value: 'legal',
      label: 'Legal',
      portalKind: 'internal',
      requiresBusinessUnit: false,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Specialist review'
    },
    {
      value: 'procurement',
      label: 'Procurement',
      portalKind: 'internal',
      requiresBusinessUnit: false,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Risk gate'
    },
    {
      value: 'vendor_contact',
      label: 'Vendor contact',
      portalKind: 'vendor',
      requiresBusinessUnit: true,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Case-linked external access by business unit'
    }
  ]);

  const ROLE_META = Object.freeze({
    admin: Object.freeze({
      value: 'admin',
      label: 'Global admin',
      portalKind: 'admin',
      requiresBusinessUnit: false,
      requiresDepartment: false,
      departmentOptional: true,
      scopeLabel: 'Platform administration'
    }),
    ...MANAGED_ROLE_OPTIONS.reduce((accumulator, role) => {
      accumulator[role.value] = Object.freeze({ ...role });
      return accumulator;
    }, {})
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function normaliseRole(role, { defaultRole = 'user' } = {}) {
    const safeDefault = ROLE_META[String(defaultRole || '').trim().toLowerCase()]
      ? String(defaultRole || '').trim().toLowerCase()
      : 'user';
    const safeRole = String(role || '').trim().toLowerCase();
    return ROLE_META[safeRole] ? safeRole : safeDefault;
  }

  function getRoleMeta(role) {
    const safeRole = normaliseRole(role);
    return clone(ROLE_META[safeRole] || ROLE_META.user);
  }

  function isAdminRole(role) {
    return ADMIN_PORTAL_ROLES.has(normaliseRole(role, { defaultRole: 'user' }));
  }

  function isGlobalAdminRole(role) {
    return normaliseRole(role, { defaultRole: 'user' }) === 'admin';
  }

  function isScopedAdminRole(role) {
    return normaliseRole(role, { defaultRole: 'user' }) === 'bu_admin';
  }

  function isVendorRole(role) {
    return getRoleMeta(role).portalKind === 'vendor';
  }

  function isInternalRole(role) {
    return getRoleMeta(role).portalKind === 'internal';
  }

  function getPortalKindForRole(role) {
    if (!role) return 'guest';
    return getRoleMeta(role).portalKind || 'guest';
  }

  function getHomeRouteForRole(role, { whenGuest = '/login' } = {}) {
    const portalKind = getPortalKindForRole(role);
    if (portalKind === 'admin') return '/admin/home';
    if (portalKind === 'vendor') return '/vendor/home';
    if (portalKind === 'internal') return '/internal/home';
    return whenGuest;
  }

  function listManageableRoles() {
    return MANAGED_ROLE_OPTIONS.map(role => ({ ...role }));
  }

  function listManageableRolesForActor(actorRole = 'admin') {
    const safeActorRole = normaliseRole(actorRole, { defaultRole: 'user' });
    const allowedValues = safeActorRole === 'bu_admin'
      ? BU_ADMIN_MANAGED_ROLE_VALUES
      : GLOBAL_ADMIN_MANAGED_ROLE_VALUES;
    return MANAGED_ROLE_OPTIONS
      .filter(role => allowedValues.has(role.value))
      .map(role => ({ ...role }));
  }

  function canManageUserRole(actorRole = 'user', targetRole = 'user') {
    const safeActorRole = normaliseRole(actorRole, { defaultRole: 'user' });
    const safeTargetRole = normaliseRole(targetRole, { defaultRole: 'user' });
    if (safeActorRole === 'admin') return safeTargetRole !== 'admin';
    if (safeActorRole === 'bu_admin') return BU_ADMIN_MANAGED_ROLE_VALUES.has(safeTargetRole);
    return false;
  }

  function normaliseAdminRoute(route = '') {
    const safeRoute = String(route || '').trim();
    if (!safeRoute) return '';
    const pathOnly = safeRoute
      .replace(/^#/, '')
      .split('?')[0]
      .split('#')[0]
      .replace(/\/+$/, '');
    if (!pathOnly) return '';
    if (pathOnly === '/admin/settings') return pathOnly;
    if (pathOnly.startsWith('/admin/settings/')) {
      const section = pathOnly.split('/').pop();
      return `/admin/settings/${section || ''}`.replace(/\/+$/, '');
    }
    return pathOnly;
  }

  function canAccessAdminRoute(role, route = '') {
    const safeRole = normaliseRole(role, { defaultRole: 'user' });
    const safeRoute = normaliseAdminRoute(route);
    if (!isAdminRole(safeRole)) return false;
    if (!safeRoute) return true;
    const allowedRoles = ADMIN_ROUTE_ACCESS[safeRoute];
    if (Array.isArray(allowedRoles)) return allowedRoles.includes(safeRole);
    if (safeRoute === '/admin/settings') return true;
    return false;
  }

  function canAccessAdminSection(role, section = '') {
    const safeSection = String(section || '').trim().toLowerCase();
    if (!safeSection) return false;
    return canAccessAdminRoute(role, `/admin/settings/${safeSection}`);
  }

  function getAccessibleAdminSections(role) {
    const sectionOrder = ['org', 'company', 'defaults', 'governance', 'feedback', 'access', 'users', 'audit'];
    return sectionOrder.filter(section => canAccessAdminSection(role, section));
  }

  function getDefaultAdminSectionForRole(role, preferredSection = '') {
    const safePreferredSection = String(preferredSection || '').trim().toLowerCase();
    if (safePreferredSection && canAccessAdminSection(role, safePreferredSection)) return safePreferredSection;
    const accessibleSections = getAccessibleAdminSections(role);
    return accessibleSections[0] || 'org';
  }

  function getAdminFallbackRouteForRole(role, { requestedRoute = '' } = {}) {
    const safeRole = normaliseRole(role, { defaultRole: 'user' });
    const safeRequestedRoute = normaliseAdminRoute(requestedRoute);
    if (safeRequestedRoute && canAccessAdminRoute(safeRole, safeRequestedRoute)) return safeRequestedRoute;
    if (isAdminRole(safeRole)) {
      if (safeRequestedRoute.startsWith('/admin/settings')) {
        return `/admin/settings/${getDefaultAdminSectionForRole(safeRole)}`;
      }
      if (canAccessAdminRoute(safeRole, '/admin/home')) return '/admin/home';
    }
    return getHomeRouteForRole(safeRole, { whenGuest: '/login' });
  }

  const api = {
    ROLE_META: clone(ROLE_META),
    normaliseRole,
    getRoleMeta,
    isAdminRole,
    isGlobalAdminRole,
    isScopedAdminRole,
    isVendorRole,
    isInternalRole,
    getPortalKindForRole,
    getHomeRouteForRole,
    listManageableRoles,
    listManageableRolesForActor,
    canManageUserRole,
    canAccessAdminRoute,
    canAccessAdminSection,
    getAccessibleAdminSections,
    getDefaultAdminSectionForRole,
    getAdminFallbackRouteForRole
  };

  globalScope.PortalAccessService = api;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
