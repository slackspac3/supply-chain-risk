const { test, expect } = require('@playwright/test');

const HOSTED_API_ORIGIN = 'https://supply-chain-risk-two.vercel.app';

function buildSession(user, apiSessionToken = 'portal-smoke-session-token') {
  return {
    authenticated: true,
    ts: Date.now(),
    user,
    apiSessionToken,
    context: {}
  };
}

function buildAuditSummary(entries = []) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  return {
    total: safeEntries.length,
    retainedCapacity: 200,
    loginSuccessCount: safeEntries.filter((entry) => entry?.eventType === 'login_success').length,
    loginFailureCount: safeEntries.filter((entry) => entry?.eventType === 'login_failure').length,
    logoutCount: safeEntries.filter((entry) => entry?.eventType === 'logout').length,
    adminActionCount: safeEntries.filter((entry) => entry?.actorRole === 'admin').length,
    buAdminActionCount: safeEntries.filter((entry) => entry?.actorRole === 'bu_admin').length,
    userActionCount: safeEntries.filter((entry) => entry?.actorRole && !['admin', 'bu_admin'].includes(entry.actorRole)).length
  };
}

function buildAdminSettings(overrides = {}) {
  return {
    geography: 'United Arab Emirates',
    companyStructure: [],
    entityContextLayers: [],
    applicableRegulations: ['UAE PDPL'],
    aiInstructions: 'Use British English.',
    benchmarkStrategy: 'Prefer GCC and UAE benchmark references.',
    typicalDepartments: ['Security'],
    ...overrides
  };
}

function buildUserState(overrides = {}) {
  return {
    userSettings: null,
    assessments: [],
    learningStore: { templates: {} },
    draft: null,
    _meta: { revision: 1, updatedAt: Date.now() },
    ...overrides
  };
}

async function seedAuthenticatedUser(page, {
  username,
  displayName,
  role,
  businessUnitEntityId = '',
  departmentEntityId = '',
  userSettings = null,
  adminSettings = null,
  preferredAdminSection = 'home',
  vendorCases = null
}) {
  await page.addInitScript((payload) => {
    sessionStorage.setItem('rq_auth_session', JSON.stringify(payload.session));
    if (payload.userSettings) {
      localStorage.setItem(`rq_user_settings__${payload.session.user.username}`, JSON.stringify(payload.userSettings));
    }
    if (payload.adminSettings) {
      localStorage.setItem('rq_admin_settings', JSON.stringify(payload.adminSettings));
    }
    localStorage.setItem('rq_admin_active_section', payload.preferredAdminSection);
    if (Array.isArray(payload.vendorCases)) {
      localStorage.setItem('vrm_vendor_cases_v1', JSON.stringify(payload.vendorCases));
    }
  }, {
    session: buildSession({ username, displayName, role, businessUnitEntityId, departmentEntityId }),
    userSettings,
    adminSettings,
    preferredAdminSection,
    vendorCases
  });
}

async function mockPortalApis(page, {
  loginUser = null,
  userState = null,
  settings = null,
  reviewQueueItems = [],
  auditEntries = [],
  managedAccounts = []
} = {}) {
  const observedRequests = [];
  const responseSettings = settings || buildAdminSettings();
  const responseUserState = userState || buildUserState();

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    observedRequests.push({ url: request.url(), method: request.method(), path: url.pathname });

    if (url.pathname === '/api/users') {
      if (request.method() === 'POST') {
        let payload = {};
        try {
          payload = request.postDataJSON() || {};
        } catch {}
        if (payload?.action === 'login' && loginUser) {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              user: loginUser,
              sessionToken: 'portal-smoke-login-token'
            })
          });
          return;
        }
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          accounts: managedAccounts,
          storage: { writable: true, mode: 'shared-kv' }
        })
      });
      return;
    }

    if (url.pathname === '/api/user-state') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(request.method() === 'GET'
          ? { state: responseUserState }
          : { ok: true, state: responseUserState })
      });
      return;
    }

    if (url.pathname === '/api/settings') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ settings: responseSettings })
      });
      return;
    }

    if (url.pathname === '/api/ai/status') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          mode: 'live',
          providerReachable: true,
          model: 'gpt-5.1',
          proxyConfigured: true,
          checkedAt: Date.now()
        })
      });
      return;
    }

    if (url.pathname === '/api/audit-log') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          entries: auditEntries,
          summary: buildAuditSummary(auditEntries)
        })
      });
      return;
    }

    if (url.pathname === '/api/review-queue') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: reviewQueueItems
        })
      });
      return;
    }

    if (url.pathname === '/api/org-intelligence') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          patterns: [],
          calibration: { updatedAt: 0, scenarioTypes: {} },
          decisions: [],
          coverageMap: { updatedAt: 0, scenarioTypes: {} },
          feedback: { updatedAt: 0, events: [] },
          updatedAt: 0
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true })
    });
  });

  return observedRequests;
}

async function expectNoClientCrashOnRoute(page, route, assertion) {
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(route);
  await assertion();
  expect(pageErrors, `Unexpected page errors on ${route}: ${pageErrors.join(' | ')}`).toEqual([]);
}

function expectHostedApiOriginRequests(requests, label) {
  expect(Array.isArray(requests), `${label} request capture must be an array`).toBeTruthy();
  expect(requests.length, `${label} requests were not observed`).toBeGreaterThan(0);
  requests.forEach((request) => {
    expect(new URL(request.url).origin, `${label} request used the wrong origin: ${request.url}`).toBe(HOSTED_API_ORIGIN);
  });
}

function buildVendorCaseSeed() {
  return [
    {
      id: 'VRM-2026-001',
      vendorName: 'Aster Cloud',
      title: 'Aster Cloud supplier collaboration platform',
      status: 'awaiting_vendor_clarification',
      serviceType: 'saas',
      serviceScope: 'Hosted SaaS platform for supplier collaboration, contract workflows, and spend analytics.',
      businessUnit: 'Group Procurement',
      assignedVendorUsername: 'vendor.demo',
      intake: {
        dataTypes: ['PII', 'Finance details'],
        headquartered: 'United Arab Emirates',
        hostingRegion: 'Germany'
      },
      questionnaire: {
        status: 'submitted',
        responses: {}
      },
      vendor: {
        assignedVendorUsername: 'vendor.demo',
        latestMessage: 'Please confirm the production log-retention period and whether subprocessor changes require customer notification.',
        evidenceFiles: [],
        clarificationHistory: []
      },
      internal: {
        findings: [],
        controlRecommendations: [],
        reviewChecklistStatus: {},
        aiAnalysis: null
      },
      schedule: {
        dueDate: '2026-04-30T00:00:00.000Z',
        reassessmentDate: '2027-04-30T00:00:00.000Z',
        lastActivityAt: '2026-04-13T00:00:00.000Z'
      },
      activity: []
    }
  ];
}

test('login screen renders without crashing', async ({ page }) => {
  await expectNoClientCrashOnRoute(page, '/#/login', async () => {
    await expect(page.getByRole('button', { name: /sign in/i })).toBeVisible();
  });
});

test('enter on login signs a GTR analyst into the internal portal', async ({ page }) => {
  const observedRequests = await mockPortalApis(page, {
    loginUser: {
      username: 'lina.gtr',
      displayName: 'Lina GTR',
      role: 'gtr_analyst',
      businessUnitEntityId: '',
      departmentEntityId: ''
    },
    settings: buildAdminSettings()
  });

  await expectNoClientCrashOnRoute(page, '/#/login', async () => {
    await page.getByLabel(/username/i).fill('lina.gtr');
    await page.getByLabel(/password/i).fill('secret');
    await page.getByLabel(/password/i).press('Enter');
    await expect(page.getByRole('heading', { name: /poc data warning/i })).toBeVisible();
    await page.getByRole('button', { name: /i understand/i }).click();
    await expect(page).toHaveURL(/#\/internal\/home$/);
    await expect(page.getByRole('heading', { name: /vendor assurance workbench/i })).toBeVisible();
    await expect(page.getByText(/internal gtr console/i)).toBeVisible();
  });

  expectHostedApiOriginRequests(
    observedRequests.filter((request) => ['/api/users', '/api/user-state', '/api/settings'].includes(request.path)),
    'Login portal'
  );
});

test('admin home opens the internal portal instead of crashing', async ({ page }) => {
  const adminSettings = buildAdminSettings();
  const observedRequests = await mockPortalApis(page, {
    settings: adminSettings,
    reviewQueueItems: []
  });

  await seedAuthenticatedUser(page, {
    username: 'global.admin',
    displayName: 'Global Admin',
    role: 'admin',
    adminSettings,
    preferredAdminSection: 'home'
  });

  await expectNoClientCrashOnRoute(page, '/#/admin/home', async () => {
    await expect(page.getByRole('heading', { name: /administration/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /open internal portal/i })).toBeVisible();
    await page.getByRole('link', { name: /open internal portal/i }).click();
    await expect(page).toHaveURL(/#\/internal\/home$/);
    await expect(page.getByRole('heading', { name: /vendor assurance workbench/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /open case queue/i })).toBeVisible();
  });

  expectHostedApiOriginRequests(
    observedRequests.filter((request) => ['/api/settings', '/api/review-queue'].includes(request.path)),
    'Admin portal'
  );
});

test('vendor portal routes render without crashing for an authenticated vendor account', async ({ page }) => {
  const adminSettings = buildAdminSettings();
  const observedRequests = await mockPortalApis(page, {
    settings: adminSettings
  });

  await seedAuthenticatedUser(page, {
    username: 'vendor.demo',
    displayName: 'Aster Vendor',
    role: 'vendor_contact',
    businessUnitEntityId: 'bu-procurement',
    userSettings: buildUserState({
      userSettings: {
        onboardedAt: '2026-04-13T00:00:00.000Z',
        _overrideKeys: [],
        userProfile: {
          fullName: 'Aster Vendor',
          businessUnit: 'Group Procurement'
        }
      }
    }).userSettings,
    vendorCases: buildVendorCaseSeed()
  });

  await expectNoClientCrashOnRoute(page, '/#/vendor/home', async () => {
    await expect(page.locator('h2').filter({ hasText: /vendor portal|case workspace/i })).toBeVisible();
  });

  await expectNoClientCrashOnRoute(page, '/#/vendor/questionnaire/VRM-2026-001', async () => {
    await expect(page.locator('h2').filter({ hasText: /vendor questionnaire|vrm-2026-001/i })).toBeVisible();
  });

  expectHostedApiOriginRequests(
    observedRequests.filter((request) => ['/api/settings', '/api/user-state'].includes(request.path)),
    'Vendor portal'
  );
});
