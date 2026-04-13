(function(global) {
  'use strict';

  const AppRoutes = {
    register(router) {
      return router
        .on('/login', renderLogin)
        .on('/', () => {
          if (!AuthService.isAuthenticated()) {
            Router.navigate('/login');
            return;
          }
          Router.navigate(typeof getDefaultRouteForCurrentUser === 'function'
            ? getDefaultRouteForCurrentUser()
            : '/dashboard');
        })
        .on('/internal/home', withPortalAccess('internal', renderInternalPortalHome))
        .on('/internal/cases', withPortalAccess('internal', renderInternalCaseQueue))
        .on('/internal/review/:id', withPortalAccess('internal', params => renderInternalCaseReview(params.id)))
        .on('/vendor/home', withPortalAccess('vendor', renderVendorPortalHome))
        .on('/vendor/questionnaire', withPortalAccess('vendor', () => renderVendorQuestionnaire()))
        .on('/vendor/questionnaire/:id', withPortalAccess('vendor', params => renderVendorQuestionnaire(params.id)))
        .on('/vendor/evidence', withPortalAccess('vendor', () => renderVendorEvidence()))
        .on('/vendor/evidence/:id', withPortalAccess('vendor', params => renderVendorEvidence(params.id)))
        .on('/dashboard', withAuth(renderUserDashboard))
        .on('/wizard/1', withAuth(renderWizard1))
        .on('/wizard/2', withAuth(renderWizard2))
        .on('/wizard/3', withAuth(renderWizard3))
        .on('/wizard/4', withAuth(renderWizard4))
        .on('/results/:id', withAuth(params => renderResults(params.id)))
        .on('/settings', withAuth(renderUserSettings))
        .on('/help', withAuth(renderHelpPage))
        .on('/admin', renderLogin)
        .on('/admin/home', withAdmin(renderAdminHome, '/admin/home'))
        .on('/admin/settings', withAdmin(() => safeRenderAdminSettings(getPreferredAdminSection()), '/admin/settings'))
        .on('/admin/settings/org', withAdmin(() => safeRenderAdminSettings('org'), '/admin/settings/org'))
        .on('/admin/settings/company', withAdmin(() => safeRenderAdminSettings('company'), '/admin/settings/company'))
        .on('/admin/settings/defaults', withAdmin(() => safeRenderAdminSettings('defaults'), '/admin/settings/defaults'))
        .on('/admin/settings/governance', withAdmin(() => safeRenderAdminSettings('governance'), '/admin/settings/governance'))
        .on('/admin/settings/feedback', withAdmin(() => safeRenderAdminSettings('feedback'), '/admin/settings/feedback'))
        .on('/admin/settings/access', withAdmin(() => safeRenderAdminSettings('access'), '/admin/settings/access'))
        .on('/admin/settings/users', withAdmin(() => safeRenderAdminSettings('users'), '/admin/settings/users'))
        .on('/admin/settings/audit', withAdmin(() => safeRenderAdminSettings('audit'), '/admin/settings/audit'))
        .on('/admin/bu', withAdmin(renderAdminBU, '/admin/bu'))
        .on('/admin/docs', withAdmin(renderAdminDocs, '/admin/docs'))
        .notFound(() => {
          if (!AuthService.isAuthenticated()) {
            Router.navigate('/login');
            return;
          }
          const fallbackRoute = typeof getDefaultRouteForCurrentUser === 'function'
            ? getDefaultRouteForCurrentUser()
            : '/dashboard';
          const fallbackLabel = fallbackRoute === '/admin/home'
            ? '← Admin Home'
            : fallbackRoute === '/vendor/home'
              ? '← Vendor Portal'
              : fallbackRoute === '/internal/home'
                ? '← Internal Portal'
            : '← Dashboard';
          setPage(`<div class="container" style="padding:var(--sp-12)"><h2>Page Not Found</h2><a href="#${fallbackRoute}" class="btn btn--primary" style="margin-top:var(--sp-4)">${fallbackLabel}</a></div>`);
        });
    }
  };

  global.AppRoutes = AppRoutes;
})(window);
