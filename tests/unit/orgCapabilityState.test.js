'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadOrgCapabilityInternals({ currentUser, settings } = {}) {
  const filePath = path.resolve(__dirname, '../../assets/state/orgCapabilityState.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const context = {
    console,
    window: {},
    AuthService: {
      getCurrentUser: () => currentUser || null
    },
    getUserSettings: () => ({ userProfile: {} }),
    getAdminSettings: () => settings,
    normaliseUserProfile: (profile = {}, user = null) => ({
      fullName: String(profile.fullName || user?.displayName || '').trim(),
      jobTitle: String(profile.jobTitle || '').trim(),
      department: String(profile.department || '').trim(),
      businessUnit: String(profile.businessUnit || '').trim(),
      departmentEntityId: String(profile.departmentEntityId || '').trim(),
      businessUnitEntityId: String(profile.businessUnitEntityId || '').trim(),
      focusAreas: Array.isArray(profile.focusAreas) ? profile.focusAreas : [],
      preferredOutputs: String(profile.preferredOutputs || '').trim(),
      workingContext: String(profile.workingContext || '').trim()
    }),
    isCompanyEntityType: (type = '') => !String(type || '').toLowerCase().includes('department'),
    isDepartmentEntityType: (type = '') => String(type || '').toLowerCase().includes('department'),
    getEntityById: (structure = [], entityId = '') => (Array.isArray(structure) ? structure : []).find(node => node.id === entityId) || null
  };
  context.global = context;
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'orgCapabilityState.js' });
  return context.window;
}

test('reconcileUserProfileToManagedScope replaces stale standard-user department assignments with the managed assignment', () => {
  const settings = {
    companyStructure: [
      { id: 'g42', type: 'Holding company', name: 'G42', ownerUsername: '' },
      { id: 'procurement', type: 'Department / function', parentId: 'g42', name: 'Procurement', ownerUsername: '' },
      { id: 'group-technology-risk', type: 'Department / function', parentId: 'g42', name: 'Group Technology Risk', ownerUsername: '' }
    ]
  };
  const currentUser = {
    username: 'tarun.gupta',
    displayName: 'Tarun Gupta',
    role: 'user',
    businessUnitEntityId: 'g42',
    departmentEntityId: 'group-technology-risk'
  };
  const { reconcileUserProfileToManagedScope } = loadOrgCapabilityInternals({ currentUser, settings });

  const profile = reconcileUserProfileToManagedScope({
    businessUnitEntityId: 'g42',
    businessUnit: 'G42',
    departmentEntityId: 'procurement',
    department: 'Procurement'
  }, currentUser, settings);

  assert.equal(profile.businessUnitEntityId, 'g42');
  assert.equal(profile.departmentEntityId, 'group-technology-risk');
  assert.equal(profile.department, 'Group Technology Risk');
});
