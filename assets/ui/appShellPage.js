(function(global) {
  'use strict';

  function getWizardStepNumber(route = '') {
    const value = String(route || '').trim();
    const match = value.match(/^\/wizard\/([1-4])(?:$|[/?#])/);
    if (match) return Number(match[1]);
    if (value === '/wizard/review') return 4;
    return 0;
  }

  function buildWizardStepBarMarkup(currentStep) {
    const getStepClass = (stepNumber) => {
      if (stepNumber < currentStep) return 'wizard-step wizard-step--complete';
      if (stepNumber === currentStep) return 'wizard-step wizard-step--active';
      return 'wizard-step';
    };
    return `<nav class="wizard-step-bar" aria-label="Assessment progress">
      <div class="${getStepClass(1)}" data-step="1">
        <div class="wizard-step__dot">1</div>
        <div class="wizard-step__label">Risks</div>
      </div>
      <div class="wizard-step-connector"></div>
      <div class="${getStepClass(2)}" data-step="2">
        <div class="wizard-step__dot">2</div>
        <div class="wizard-step__label">Scenario</div>
      </div>
      <div class="wizard-step-connector"></div>
      <div class="${getStepClass(3)}" data-step="3">
        <div class="wizard-step__dot">3</div>
        <div class="wizard-step__label">Estimate</div>
      </div>
      <div class="wizard-step-connector"></div>
      <div class="${getStepClass(4)}" data-step="4">
        <div class="wizard-step__dot">4</div>
        <div class="wizard-step__label">Run Model</div>
      </div>
    </nav>`;
  }

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
      const route = String(step || '').trim();
      const isWizardRoute = route.startsWith('/wizard/');
      const existingBar = bar.querySelector('.wizard-step-bar');
      bar.style.setProperty('--wizard-progress', '0%');
      if (!isWizardRoute) {
        existingBar?.remove();
        bar.classList.remove('app-bar--wizard-steps');
        return;
      }
      const currentStep = getWizardStepNumber(route);
      bar.classList.add('app-bar--wizard-steps');
      const markup = buildWizardStepBarMarkup(currentStep);
      if (existingBar) {
        existingBar.outerHTML = markup;
        return;
      }
      const barInner = bar.querySelector('.bar-inner');
      if (barInner) {
        barInner.insertAdjacentHTML('afterend', markup);
        return;
      }
      bar.insertAdjacentHTML('beforeend', markup);
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
