'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normaliseEntityObligations,
  resolveObligationContext
} = require('../../assets/state/obligationResolution.js');

test('normaliseEntityObligations keeps a stable governed schema', () => {
  const obligations = normaliseEntityObligations([
    {
      sourceEntityId: 'holding-g42',
      title: 'Group Export Controls Obligation',
      flowDownMode: 'partial',
      flowDownTargets: {
        departmentNames: ['Technology', 'Technology'],
        geographies: ['United Arab Emirates', 'United Arab Emirates']
      },
      regulationTags: ['BIS Export Controls', 'BIS Export Controls']
    }
  ]);

  assert.equal(obligations.length, 1);
  assert.equal(obligations[0].requirementLevel, 'mandatory');
  assert.equal(obligations[0].flowDownMode, 'partial');
  assert.deepEqual(obligations[0].flowDownTargets.departmentNames, ['technology']);
  assert.deepEqual(obligations[0].flowDownTargets.geographies, ['united arab emirates']);
  assert.deepEqual(obligations[0].regulationTags, ['BIS Export Controls']);
});

test('resolveObligationContext applies direct and inherited obligations for a subsidiary function scope', () => {
  const structure = [
    { id: 'holding-g42', parentId: '', type: 'Holding company', name: 'G42 Holding' },
    { id: 'subsidiary-tech', parentId: 'holding-g42', type: 'Wholly owned subsidiary', name: 'Tech Subsidiary' },
    { id: 'dept-tech', parentId: 'subsidiary-tech', type: 'Department / function', name: 'Technology' }
  ];
  const entityObligations = [
    {
      id: 'holding-export-controls',
      sourceEntityId: 'holding-g42',
      title: 'Group export controls obligation',
      familyKey: 'export-controls',
      type: 'regulatory',
      requirementLevel: 'mandatory',
      flowDownMode: 'partial',
      flowDownTargets: {
        entityTypes: ['Wholly owned subsidiary'],
        departmentNames: ['Technology'],
        geographies: ['United Arab Emirates']
      },
      inheritedView: {
        childRequirementLevel: 'conditional',
        childText: 'Applies where the subsidiary handles controlled technology, suppliers, or transfers.'
      },
      regulationTags: ['BIS Export Controls']
    },
    {
      id: 'subsidiary-privacy',
      sourceEntityId: 'subsidiary-tech',
      title: 'Subsidiary privacy controls obligation',
      familyKey: 'privacy-controls',
      type: 'regulatory',
      requirementLevel: 'mandatory',
      flowDownMode: 'none',
      regulationTags: ['UAE PDPL']
    },
    {
      id: 'department-identity',
      sourceEntityId: 'dept-tech',
      title: 'Privileged access operating standard',
      familyKey: 'identity-standard',
      type: 'policy',
      requirementLevel: 'guidance',
      flowDownMode: 'none'
    }
  ];

  const resolved = resolveObligationContext({
    structure,
    entityObligations,
    businessUnitEntityId: 'subsidiary-tech',
    departmentEntityId: 'dept-tech',
    geography: 'United Arab Emirates'
  });

  assert.equal(resolved.direct.length, 2);
  assert.equal(resolved.inheritedConditional.length, 1);
  assert.equal(resolved.inheritedMandatory.length, 0);
  assert.deepEqual(
    resolved.resolvedApplicableRegulations,
    ['UAE PDPL', 'BIS Export Controls']
  );
  assert.match(resolved.summary, /Direct obligations/i);
  assert.match(resolved.summary, /Inherited conditional obligations/i);
});

test('resolveObligationContext gives direct child obligations precedence over inherited parent obligations with the same family key', () => {
  const structure = [
    { id: 'holding-g42', parentId: '', type: 'Holding company', name: 'G42 Holding' },
    { id: 'subsidiary-tech', parentId: 'holding-g42', type: 'Wholly owned subsidiary', name: 'Tech Subsidiary' }
  ];
  const entityObligations = [
    {
      id: 'holding-export-controls',
      sourceEntityId: 'holding-g42',
      title: 'Group export controls obligation',
      familyKey: 'export-controls',
      type: 'regulatory',
      requirementLevel: 'mandatory',
      flowDownMode: 'full',
      regulationTags: ['BIS Export Controls']
    },
    {
      id: 'subsidiary-export-controls',
      sourceEntityId: 'subsidiary-tech',
      title: 'Subsidiary export controls obligation',
      familyKey: 'export-controls',
      type: 'regulatory',
      requirementLevel: 'mandatory',
      flowDownMode: 'none',
      regulationTags: ['Subsidiary Export Rule']
    }
  ];

  const resolved = resolveObligationContext({
    structure,
    entityObligations,
    businessUnitEntityId: 'subsidiary-tech',
    geography: 'United Arab Emirates'
  });

  assert.equal(resolved.direct.length, 1);
  assert.equal(resolved.inheritedMandatory.length, 0);
  assert.deepEqual(resolved.resolvedApplicableRegulations, ['Subsidiary Export Rule']);
});
