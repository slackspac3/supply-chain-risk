'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { normaliseSettings } = require('../../api/settings.js');

test('settings normalisation preserves governed entity obligations', () => {
  const settings = normaliseSettings({
    entityObligations: [
      {
        sourceEntityId: 'holding-g42',
        title: 'Group export controls obligation',
        type: 'regulatory',
        flowDownMode: 'partial',
        flowDownTargets: {
          departmentNames: ['Technology', 'Technology'],
          geographies: ['United Arab Emirates']
        },
        regulationTags: ['BIS Export Controls']
      }
    ]
  });

  assert.equal(Array.isArray(settings.entityObligations), true);
  assert.equal(settings.entityObligations.length, 1);
  assert.equal(settings.entityObligations[0].sourceEntityId, 'holding-g42');
  assert.equal(settings.entityObligations[0].flowDownMode, 'partial');
  assert.deepEqual(settings.entityObligations[0].flowDownTargets.departmentNames, ['technology']);
  assert.deepEqual(settings.entityObligations[0].regulationTags, ['BIS Export Controls']);
});

test('settings normalisation defaults entity obligations to an empty array', () => {
  const settings = normaliseSettings({});
  assert.deepEqual(settings.entityObligations, []);
});
