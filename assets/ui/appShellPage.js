(function(global) {
  'use strict';

  function getRoutePageClass(route = '') {
    const value = String(route || '');
    if (value.startsWith('/results')) return 'page--results';
    if (value.startsWith('/wizard')) return 'page--wizard';
    if (value.startsWith('/admin')) return 'page--admin';
    return 'page--dashboard';
  }

  const pageShell = {
    updateWizardProgressBar(step) {
      const bar = document.getElementById('app-bar');
      if (!bar) return;
      const currentStep = String(step || '');
      const normalisedStep = currentStep.startsWith('/results/')
        ? '/results'
        : currentStep;
      const progressMap = {
        '/wizard/1': '25%',
        '/wizard/2': '50%',
        '/wizard/3': '75%',
        '/wizard/review': '90%',
        '/wizard/4': '90%',
        '/results': '100%'
      };
      bar.style.setProperty('--wizard-progress', progressMap[normalisedStep] || '0%');
    },

    setPage(html) {
      const root = document.getElementById('main-content');
      root.innerHTML = html;
      const routePageClass = getRoutePageClass(window.location.hash.replace('#', ''));
      const pageNode = root.querySelector('.page');
      if (pageNode) {
        pageNode.classList.remove('page--dashboard', 'page--wizard', 'page--results', 'page--admin');
        pageNode.classList.add(routePageClass);
      }
      // Route transitions were handled ad hoc in app.js; centralising the page mount keeps polish logic in one place.
      const pageShellNode = root.querySelector('.page, .dashboard-shell, .wizard-layout, .admin-shell');
      if (pageShellNode) {
        window.requestAnimationFrame(() => {
          pageShellNode.classList.add('page-enter-active');
          window.setTimeout(() => {
            pageShellNode.classList.remove('page-enter-active');
          }, 280);
        });
      }
      if (typeof bindDisclosureState === 'function') bindDisclosureState(root);
      if (typeof applyPageNavigationEffects === 'function') applyPageNavigationEffects(root);
      pageShell.updateWizardProgressBar(window.location.hash.replace('#', ''));
      document.getElementById('boot-skeleton-nav')?.remove();
      document.getElementById('boot-skeleton-content')?.remove();
    }
  };

  global.AppShellPage = pageShell;
})(window);
