'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDraftWorkspaceSection,
  buildSavedAssessmentsSection,
  normaliseUserWorkspaceState,
  serializeUserWorkspaceState
} = require('../../assets/state/userWorkspacePersistence.js');

test('normaliseUserWorkspaceState migrates legacy draft and assessments into bounded sections', () => {
  const state = normaliseUserWorkspaceState({
    userSettings: { geography: 'UAE' },
    draft: { id: 'draft-1', scenarioTitle: 'Draft one' },
    assessments: [{ id: 'a-1', scenarioTitle: 'Assessment one' }]
  });

  assert.equal(state.draftWorkspace.draft.id, 'draft-1');
  assert.equal(state.savedAssessments.index[0].id, 'a-1');
  assert.equal(state.assessments[0].scenarioTitle, 'Assessment one');
});

test('serializeUserWorkspaceState keeps the canonical bounded sections without duplicating legacy fields', () => {
  const serialized = serializeUserWorkspaceState({
    userSettings: { geography: 'UAE' },
    draftWorkspace: buildDraftWorkspaceSection({ id: 'draft-2', scenarioTitle: 'Draft two' }),
    savedAssessments: buildSavedAssessmentsSection([{ id: 'a-2', scenarioTitle: 'Assessment two' }]),
    _meta: { revision: 3, updatedAt: 55 }
  });

  assert.equal(Boolean(serialized.draftWorkspace), true);
  assert.equal(Boolean(serialized.savedAssessments), true);
  assert.equal(Object.prototype.hasOwnProperty.call(serialized, 'draft'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(serialized, 'assessments'), false);
});
