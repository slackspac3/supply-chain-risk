function requireAuth() {
  const user = AuthService?.getCurrentUser?.();
  if (!user) {
    if (typeof AppState !== 'undefined' && AppState) AppState.currentUser = null;
    if (String(window.location.hash || '') !== '#/login') {
      window.location.hash = '#/login';
    }
    // Protected-route redirects can happen during initial resolution, so render the login surface immediately.
    if (typeof renderLogin === 'function') renderLogin();
    else Router?.navigate('/login');
    return false;
  }
  if (typeof AppState !== 'undefined' && AppState) AppState.currentUser = user;
  return true;
}

function requireAdmin(targetRoute = '') {
  if (!requireAuth()) return false;
  const currentUser = AuthService?.getCurrentUser?.();
  if (!AuthService?.isAdminAuthenticated?.()) {
    if (String(window.location.hash || '') !== '#/settings') {
      window.location.hash = '#/settings';
    }
    if (typeof renderUserSettings === 'function') renderUserSettings();
    else Router?.navigate('/settings');
    return false;
  }
  const safeTargetRoute = String(targetRoute || '').trim()
    || String(window.location.hash || '').replace(/^#/, '').trim();
  if (safeTargetRoute
    && typeof PortalAccessService !== 'undefined'
    && PortalAccessService
    && typeof PortalAccessService.canAccessAdminRoute === 'function'
    && !PortalAccessService.canAccessAdminRoute(currentUser?.role, safeTargetRoute)) {
    const fallbackRoute = typeof PortalAccessService.getAdminFallbackRouteForRole === 'function'
      ? PortalAccessService.getAdminFallbackRouteForRole(currentUser?.role, { requestedRoute: safeTargetRoute })
      : '/admin/home';
    Router?.navigate?.(fallbackRoute || '/admin/home');
    return false;
  }
  return true;
}

function requirePortalAccess(portalKind) {
  if (!requireAuth()) return false;
  const currentUser = AuthService?.getCurrentUser?.();
  const hasPortalAccess = typeof PortalAccessService !== 'undefined' && PortalAccessService
    && typeof PortalAccessService.canAccessPortalKind === 'function'
    ? PortalAccessService.canAccessPortalKind(currentUser?.role, portalKind)
    : portalKind === (typeof PortalAccessService !== 'undefined' && PortalAccessService
      ? PortalAccessService.getPortalKindForRole(currentUser?.role)
      : 'guest');
  if (hasPortalAccess) return true;
  const fallbackRoute = typeof PortalAccessService !== 'undefined' && PortalAccessService
    ? PortalAccessService.getHomeRouteForRole(currentUser?.role)
    : '/login';
  Router?.navigate?.(fallbackRoute || '/login');
  return false;
}

function withAuth(renderer) {
  return (params, hash) => {
    if (!requireAuth()) return;
    renderer(params, hash);
  };
}

function withAdmin(renderer, targetRoute = '') {
  return (params, hash) => {
    if (!requireAdmin(targetRoute)) return;
    renderer(params, hash);
  };
}

function withPortalAccess(portalKind, renderer) {
  return (params, hash) => {
    if (!requirePortalAccess(portalKind)) return;
    renderer(params, hash);
  };
}

window.requireAuth = requireAuth;
window.requireAdmin = requireAdmin;
window.requirePortalAccess = requirePortalAccess;
window.withAuth = withAuth;
window.withAdmin = withAdmin;
window.withPortalAccess = withPortalAccess;
