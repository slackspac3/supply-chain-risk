'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const PortalAccessService = require('../../assets/services/portalAccessService.js');

test('portal access service normalises supported roles and rejects unknown ones', () => {
  assert.equal(PortalAccessService.normaliseRole('GTR_ANALYST'), 'gtr_analyst');
  assert.equal(PortalAccessService.normaliseRole('vendor_contact'), 'vendor_contact');
  assert.equal(PortalAccessService.normaliseRole('something_else'), 'user');
});

test('portal access service maps roles to the correct portal homes', () => {
  assert.equal(PortalAccessService.getHomeRouteForRole('admin'), '/admin/home');
  assert.equal(PortalAccessService.getHomeRouteForRole('bu_admin'), '/admin/home');
  assert.equal(PortalAccessService.getHomeRouteForRole('vendor_contact'), '/vendor/home');
  assert.equal(PortalAccessService.getHomeRouteForRole('reviewer'), '/internal/home');
});

test('admin roles can preview the internal portal without gaining vendor access', () => {
  assert.equal(PortalAccessService.canAccessPortalKind('admin', 'internal'), true);
  assert.equal(PortalAccessService.canAccessPortalKind('bu_admin', 'internal'), true);
  assert.equal(PortalAccessService.canAccessPortalKind('admin', 'vendor'), false);
  assert.equal(PortalAccessService.canAccessPortalKind('vendor_contact', 'internal'), false);
});

test('manageable roles include the new vendor and GTR workflow roles', () => {
  const manageableRoles = PortalAccessService.listManageableRoles();
  assert.equal(manageableRoles.some((role) => role.value === 'vendor_contact'), true);
  assert.equal(manageableRoles.some((role) => role.value === 'gtr_analyst'), true);
  assert.equal(manageableRoles.some((role) => role.value === 'approver'), true);
});

test('BU admin access is limited to scoped admin sections and scoped user roles', () => {
  assert.equal(PortalAccessService.canAccessAdminRoute('bu_admin', '/admin/settings/users'), true);
  assert.equal(PortalAccessService.canAccessAdminRoute('bu_admin', '/admin/settings/audit'), true);
  assert.equal(PortalAccessService.canAccessAdminRoute('bu_admin', '/admin/settings/defaults'), false);
  assert.equal(PortalAccessService.canAccessAdminRoute('bu_admin', '/admin/docs'), false);

  const buAdminRoles = PortalAccessService.listManageableRolesForActor('bu_admin').map((role) => role.value);
  assert.deepEqual(buAdminRoles, ['user', 'function_admin', 'vendor_contact']);
  assert.equal(PortalAccessService.canManageUserRole('bu_admin', 'function_admin'), true);
  assert.equal(PortalAccessService.canManageUserRole('bu_admin', 'vendor_contact'), true);
  assert.equal(PortalAccessService.canManageUserRole('bu_admin', 'gtr_analyst'), false);
});
