(function(global) {
  'use strict';

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
      // Route transitions were handled ad hoc in app.js; centralising the page mount keeps polish logic in one place.
      const pageShellNode = root.querySelector('.page, .dashboard-shell, .wizard-layout, .admin-shell');
      if (pageShellNode) {
        pageShellNode.classList.add('page-enter');
        window.requestAnimationFrame(() => {
          pageShellNode.classList.add('page-enter-active');
          window.setTimeout(() => {
            pageShellNode.classList.remove('page-enter', 'page-enter-active');
          }, 280);
        });
      }
      if (typeof bindDisclosureState === 'function') bindDisclosureState(root);
      if (typeof applyPageNavigationEffects === 'function') applyPageNavigationEffects(root);
      pageShell.updateWizardProgressBar(window.location.hash.replace('#', ''));
    }
  };

  global.AppShellPage = pageShell;
})(window);
