'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applySavedAssessmentsDeltaPatch,
  buildDraftWorkspaceSection,
  buildSavedAssessmentsDeltaPatch,
  buildSavedAssessmentsSection,
  mergeUserWorkspacePatchSlices,
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
  assert.deepEqual(state.learningStore.aiFeedback, { events: [] });
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

test('saved assessment delta patches preserve unrelated records while carrying upserts and removals', () => {
  const previous = buildSavedAssessmentsSection([
    { id: 'a-1', scenarioTitle: 'Assessment one', createdAt: 1 },
    { id: 'a-2', scenarioTitle: 'Assessment two', createdAt: 2 }
  ]);
  const next = buildSavedAssessmentsSection([
    { id: 'a-1', scenarioTitle: 'Assessment one revised', createdAt: 1 },
    { id: 'a-3', scenarioTitle: 'Assessment three', createdAt: 3 }
  ]);

  const delta = buildSavedAssessmentsDeltaPatch(next, previous);
  assert.deepEqual(delta.removedIds, ['a-2']);
  assert.equal(delta.upsertsById['a-1'].scenarioTitle, 'Assessment one revised');
  assert.equal(delta.upsertsById['a-3'].scenarioTitle, 'Assessment three');

  const applied = applySavedAssessmentsDeltaPatch(previous, delta);
  assert.deepEqual(
    applied.index.map(entry => entry.id).sort(),
    ['a-1', 'a-3']
  );
  assert.equal(applied.itemsById['a-1'].scenarioTitle, 'Assessment one revised');
  assert.equal(Boolean(applied.itemsById['a-2']), false);
  assert.equal(applied.itemsById['a-3'].scenarioTitle, 'Assessment three');
});

test('workspace patch merging keeps per-assessment saved-state deltas instead of replacing the full slice', () => {
  const merged = mergeUserWorkspacePatchSlices(
    {
      savedAssessments: {
        upsertsById: {
          'a-1': { id: 'a-1', scenarioTitle: 'Assessment one' }
        },
        removedIds: []
      }
    },
    {
      savedAssessments: {
        upsertsById: {
          'a-2': { id: 'a-2', scenarioTitle: 'Assessment two' }
        },
        removedIds: []
      }
    }
  );

  assert.equal(merged.savedAssessments.upsertsById['a-1'].scenarioTitle, 'Assessment one');
  assert.equal(merged.savedAssessments.upsertsById['a-2'].scenarioTitle, 'Assessment two');
  assert.deepEqual(merged.savedAssessments.removedIds, []);
});
