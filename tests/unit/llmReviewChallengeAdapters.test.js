'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function loadService({ origin = 'https://slackspac3.github.io', fetchImpl } = {}) {
  const filePath = path.resolve(__dirname, '../../assets/services/llmService.js');
  const source = `${fs.readFileSync(filePath, 'utf8')}\n;globalThis.__llmService = LLMService;`;
  const noopStorage = {
    getItem() { return null; },
    setItem() {},
    removeItem() {}
  };
  const context = {
    console,
    Date,
    JSON,
    Math,
    URL,
    setTimeout,
    clearTimeout,
    AbortController,
    sessionStorage: noopStorage,
    localStorage: noopStorage,
    window: {
      location: { origin, hostname: new URL(origin).hostname },
      _lastRagSources: []
    },
    fetch: fetchImpl,
    AuthService: {
      getApiSessionToken: () => 'session-token'
    },
    AIGuardrails: null,
    BenchmarkService: {},
    logAuditEvent: async () => {}
  };

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'llmService.js' });
  return context.__llmService;
}

test('reviewer/challenge methods use server endpoints and keep trace data in runtime memory', async () => {
  const fetchCalls = [];
  const queuedResults = [
    {
      whatMatters: 'Server-owned reviewer brief',
      whatsUncertain: 'Weakest assumption from server',
      whatToDo: 'Challenge from server',
      trace: { label: 'Reviewer decision brief', promptSummary: 'Brief prompt', response: 'Brief response' }
    },
    {
      summary: 'Server-owned challenge review',
      challengeLevel: 'Targeted challenge recommended',
      weakestAssumptions: ['Recovery timing'],
      committeeQuestions: ['What evidence supports the current recovery assumption?'],
      evidenceToGather: ['Latest recovery drill'],
      reviewerGuidance: ['Challenge the recovery assumption first.'],
      trace: { label: 'Assessment challenge', promptSummary: 'Challenge prompt', response: 'Challenge response' }
    },
    {
      reconciliationSummary: 'Server-owned mediation',
      proposedMiddleGround: 'Use a moderately slower recovery estimate.',
      whyReasonable: 'It balances the reviewer concern with current evidence.',
      recommendedField: 'controlStrLikely',
      recommendedValue: 0.58,
      recommendedValueLabel: 'Moderately weaker control strength',
      evidenceToVerify: 'Latest recovery drill',
      continueDiscussionPrompt: 'Which drill result most supports the faster view?',
      trace: { label: 'Review mediation', promptSummary: 'Mediation prompt', response: 'Mediation response' }
    },
    {
      analystQuestions: ['What direct evidence supports the current parameter value?'],
      reviewerAdjustment: {
        param: 'controlStrLikely',
        suggestedValue: 0.54,
        aleImpact: 'ALE rises modestly.',
        rationale: 'This is the smallest directional adjustment that reflects the reviewer concern.'
      },
      trace: { label: 'Parameter challenge record', promptSummary: 'Parameter prompt', response: 'Parameter response' }
    },
    {
      overallConcern: 'Server-owned synthesis concern',
      revisedAleRange: 'Use a higher working ALE range until evidence closes the gap.',
      keyEvidence: 'Latest recovery drill pack',
      trace: { label: 'Challenge synthesis', promptSummary: 'Synthesis prompt', response: 'Synthesis response' }
    },
    {
      summaryBullets: ['Accept C1 first.', 'Defend C2 until stronger evidence arrives.', 'Use the projected path as the interim range.'],
      acceptChallenges: ['C1'],
      defendChallenges: ['C2'],
      meetInTheMiddleAleRange: '$3.7M mean ALE',
      trace: { label: 'Consensus recommendation', promptSummary: 'Consensus prompt', response: 'Consensus response' }
    }
  ];

  const service = loadService({
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => queuedResults.shift()
      };
    }
  });

  const reviewerBrief = await service.generateReviewerDecisionBrief({
    assessmentData: 'Assessment source text.',
    preferredSection: 'challenge'
  });
  const challenge = await service.challengeAssessment({
    scenarioTitle: 'Identity compromise',
    narrative: 'Identity compromise through exposed admin credentials.',
    geography: 'UAE',
    businessUnitName: 'G42',
    confidence: { label: 'Low confidence', summary: 'Recovery evidence is weak.' },
    drivers: { upward: ['Privileged access remains exposed'], stabilisers: [] },
    assumptions: [{ category: 'Controls', text: 'Recovery controls operate consistently.' }],
    missingInformation: ['Latest privileged access logs'],
    applicableRegulations: ['ISO 27001'],
    citations: [{ title: 'Privileged access policy' }]
  });
  const mediation = await service.mediateAssessmentDispute({
    narrative: 'Identity compromise through exposed admin credentials.',
    fairParams: { controlStrLikely: 0.62, tefLikely: 5 },
    results: { eventLoss: { p90: 9000000 }, ale: { mean: 3200000 } },
    assessmentIntelligence: { assumptions: [{ text: 'Recovery is fast.' }], drivers: { sensitivity: [{ label: 'Recovery timing', why: 'Drives the high end.' }] } },
    reviewerView: 'The recovery estimate is too optimistic.',
    analystView: 'Recent drills support the current timing.'
  });
  const parameterChallenge = await service.generateParameterChallengeRecord({
    parameterKey: 'controlStrLikely',
    parameterLabel: 'Control strength',
    currentValue: 0.62,
    currentValueLabel: '0.62',
    scenarioSummary: 'Identity compromise through exposed admin credentials.',
    reviewerConcern: 'This control strength looks too optimistic.',
    currentAle: '$3.2M mean ALE',
    allowedParams: ['controlStrLikely']
  });
  const synthesis = await service.generateChallengeSynthesis({
    scenarioTitle: 'Identity compromise',
    scenarioSummary: 'Identity compromise through exposed admin credentials.',
    baseAleRange: '$3.2M mean ALE · $9.0M bad year',
    records: [
      { parameter: 'Control strength', concern: 'Too optimistic', reviewerAdjustment: { param: 'controlStrLikely', suggestedValue: 0.54 } },
      { parameter: 'Loss magnitude', concern: 'Recovery cost understated', reviewerAdjustment: { param: 'lmHigh', suggestedValue: 2200000 } }
    ]
  });
  const consensus = await service.generateConsensusRecommendation({
    scenarioTitle: 'Identity compromise',
    scenarioSummary: 'Identity compromise through exposed admin credentials.',
    originalAleRange: '$3.2M mean ALE',
    adjustedAleRange: '$4.1M mean ALE',
    projectedAleRange: '$3.7M mean ALE',
    aleChangePct: 12,
    originalParameters: { controlStrLikely: 0.62 },
    adjustedParameters: { controlStrLikely: 0.54 },
    challenges: [
      { ref: 'C1', parameter: 'Control strength', concern: 'Too optimistic', proposedValue: '0.54', impactPct: 8, aleImpact: 'ALE rises modestly.' },
      { ref: 'C2', parameter: 'Loss magnitude', concern: 'Recovery cost understated', proposedValue: '2.2M', impactPct: 22, aleImpact: 'ALE rises materially.' }
    ]
  });

  assert.deepEqual(
    fetchCalls.map((call) => call.url),
    [
      'https://risk-calculator-eight.vercel.app/api/ai/reviewer-brief',
      'https://risk-calculator-eight.vercel.app/api/ai/challenge-assessment',
      'https://risk-calculator-eight.vercel.app/api/ai/review-mediation',
      'https://risk-calculator-eight.vercel.app/api/ai/parameter-challenge',
      'https://risk-calculator-eight.vercel.app/api/ai/challenge-synthesis',
      'https://risk-calculator-eight.vercel.app/api/ai/consensus-recommendation'
    ]
  );
  fetchCalls.forEach((call) => {
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers['x-session-token'], 'session-token');
  });
  assert.equal(reviewerBrief.whatMatters, 'Server-owned reviewer brief');
  assert.equal(challenge.summary, 'Server-owned challenge review');
  assert.equal(mediation.recommendedField, 'controlStrLikely');
  assert.equal(parameterChallenge.reviewerAdjustment.param, 'controlStrLikely');
  assert.equal(synthesis.overallConcern, 'Server-owned synthesis concern');
  assert.deepEqual(consensus.acceptChallenges, ['C1']);
  assert.equal(service.getLatestTrace('Reviewer decision brief')?.response, 'Brief response');
  assert.equal(service.getLatestTrace('Assessment challenge')?.response, 'Challenge response');
  assert.equal(service.getLatestTrace('Review mediation')?.response, 'Mediation response');
  assert.equal(service.getLatestTrace('Parameter challenge record')?.response, 'Parameter response');
  assert.equal(service.getLatestTrace('Challenge synthesis')?.response, 'Synthesis response');
  assert.equal(service.getLatestTrace('Consensus recommendation')?.response, 'Consensus response');
});

test('reviewer/challenge methods still use server endpoints even when local-dev direct Compass config is enabled', async () => {
  const fetchCalls = [];
  const service = loadService({
    origin: 'http://127.0.0.1:8080',
    fetchImpl: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        json: async () => ({
          summaryBullets: ['Fallback path'],
          acceptChallenges: [],
          defendChallenges: [],
          meetInTheMiddleAleRange: '$0',
          usedFallback: true
        })
      };
    }
  });

  service.setCompassConfig({
    apiUrl: 'https://api.core42.ai/v1/chat/completions',
    model: 'gpt-local-test',
    apiKey: 'browser-secret'
  });

  await service.generateConsensusRecommendation({
    scenarioTitle: 'Identity compromise',
    challenges: [{ ref: 'C1', impactPct: 8 }]
  });

  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://risk-calculator-eight.vercel.app/api/ai/consensus-recommendation');
});
