'use strict';

const { getCompassProviderConfig } = require('./_aiRuntime');
const { buildTraceEntry, callAi, normaliseAiError, parseOrRepairStructuredJson, sanitizeAiText } = require('./_aiOrchestrator');
const { workflowUtils } = require('./_scenarioDraftWorkflow');

const {
  buildContextPromptBlock,
  buildEvidenceMeta,
  buildResolvedObligationPromptBlock,
  cleanUserFacingText,
  compactInputValue,
  isPlainObject,
  normaliseAdminSettingsInput,
  normaliseBlockInputText,
  normaliseBusinessUnitInput,
  normaliseCitationInputs,
  normaliseGuidance,
  normaliseInlineInputText,
  normaliseStringListInput,
  truncateText,
  withEvidenceMeta
} = workflowUtils;

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return '{}';
  }
}

function normaliseNumericInput(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normaliseFairParamsInput(value = {}) {
  if (!isPlainObject(value)) return undefined;
  const next = {};
  Object.entries(value).forEach(([key, item]) => {
    const parsed = normaliseNumericInput(item);
    if (parsed !== undefined) next[key] = parsed;
  });
  return Object.keys(next).length ? next : undefined;
}

function normaliseResultsInput(value = {}) {
  if (!isPlainObject(value)) return undefined;
  return compactInputValue({
    ale: compactInputValue({
      mean: normaliseNumericInput(value?.ale?.mean)
    }),
    eventLoss: compactInputValue({
      p90: normaliseNumericInput(value?.eventLoss?.p90)
    })
  });
}

function normaliseConfidenceInput(value = {}) {
  if (!isPlainObject(value)) return undefined;
  return compactInputValue({
    label: normaliseInlineInputText(value.label || ''),
    summary: normaliseBlockInputText(value.summary || ''),
    score: normaliseNumericInput(value.score)
  });
}

function normaliseSensitivityDriverInput(item = {}) {
  if (!isPlainObject(item)) return undefined;
  return compactInputValue({
    label: normaliseInlineInputText(item.label || ''),
    why: normaliseBlockInputText(item.why || '')
  });
}

function normaliseDriversInput(value = {}) {
  if (!isPlainObject(value)) return undefined;
  return compactInputValue({
    upward: normaliseStringListInput(value.upward, { maxItems: 6, block: true }),
    stabilisers: normaliseStringListInput(value.stabilisers, { maxItems: 6, block: true }),
    sensitivity: (Array.isArray(value.sensitivity) ? value.sensitivity : [])
      .map((item) => normaliseSensitivityDriverInput(item))
      .filter(Boolean)
      .slice(0, 6)
  });
}

function normaliseAssumptionInput(item = {}) {
  if (!isPlainObject(item)) return undefined;
  return compactInputValue({
    category: normaliseInlineInputText(item.category || ''),
    text: normaliseBlockInputText(item.text || item.label || '')
  });
}

function normaliseAssumptionsInput(items = [], { maxItems = 8 } = {}) {
  return (Array.isArray(items) ? items : [])
    .map((item) => normaliseAssumptionInput(item))
    .filter(Boolean)
    .slice(0, maxItems);
}

function normaliseAssessmentIntelligenceInput(value = {}) {
  if (!isPlainObject(value)) return undefined;
  return compactInputValue({
    assumptions: normaliseAssumptionsInput(value.assumptions, { maxItems: 8 }),
    drivers: compactInputValue({
      sensitivity: (Array.isArray(value?.drivers?.sensitivity) ? value.drivers.sensitivity : [])
        .map((item) => normaliseSensitivityDriverInput(item))
        .filter(Boolean)
        .slice(0, 6)
    })
  });
}

function normaliseObligationBasisInput(value = {}) {
  if (!isPlainObject(value)) return undefined;
  return compactInputValue({
    resolvedObligationSummary: normaliseBlockInputText(value.resolvedObligationSummary || ''),
    resolvedObligationContext: workflowUtils.normaliseResolvedObligationContextInput
      ? workflowUtils.normaliseResolvedObligationContextInput(value.resolvedObligationContext)
      : undefined,
    direct: (Array.isArray(value.direct) ? value.direct : [])
      .map((item) => workflowUtils.normaliseResolvedObligationEntryInput
        ? workflowUtils.normaliseResolvedObligationEntryInput(item)
        : undefined)
      .filter(Boolean)
      .slice(0, 6),
    inheritedMandatory: (Array.isArray(value.inheritedMandatory) ? value.inheritedMandatory : [])
      .map((item) => workflowUtils.normaliseResolvedObligationEntryInput
        ? workflowUtils.normaliseResolvedObligationEntryInput(item)
        : undefined)
      .filter(Boolean)
      .slice(0, 6),
    inheritedConditional: (Array.isArray(value.inheritedConditional) ? value.inheritedConditional : [])
      .map((item) => workflowUtils.normaliseResolvedObligationEntryInput
        ? workflowUtils.normaliseResolvedObligationEntryInput(item)
        : undefined)
      .filter(Boolean)
      .slice(0, 6),
    inheritedGuidance: (Array.isArray(value.inheritedGuidance) ? value.inheritedGuidance : [])
      .map((item) => workflowUtils.normaliseResolvedObligationEntryInput
        ? workflowUtils.normaliseResolvedObligationEntryInput(item)
        : undefined)
      .filter(Boolean)
      .slice(0, 6)
  });
}

function normaliseScenarioLensInput(value = {}) {
  if (!isPlainObject(value)) return undefined;
  return compactInputValue({
    key: normaliseInlineInputText(value.key || ''),
    label: normaliseInlineInputText(value.label || '')
  });
}

function normaliseReviewerDecisionBriefInput(input = {}) {
  return compactInputValue({
    assessmentData: normaliseBlockInputText(input.assessmentData || ''),
    preferredSection: normaliseInlineInputText(input.preferredSection || ''),
    traceLabel: normaliseInlineInputText(input.traceLabel || '')
  }) || {};
}

function normaliseChallengeAssessmentInput(input = {}) {
  return compactInputValue({
    scenarioTitle: normaliseInlineInputText(input.scenarioTitle || ''),
    narrative: normaliseBlockInputText(input.narrative || ''),
    geography: normaliseInlineInputText(input.geography || ''),
    businessUnitName: normaliseInlineInputText(input.businessUnitName || ''),
    businessUnit: normaliseBusinessUnitInput(input.businessUnit),
    adminSettings: normaliseAdminSettingsInput(input.adminSettings),
    confidence: normaliseConfidenceInput(input.confidence),
    drivers: normaliseDriversInput(input.drivers),
    assumptions: normaliseAssumptionsInput(input.assumptions, { maxItems: 8 }),
    missingInformation: normaliseStringListInput(input.missingInformation, { maxItems: 8, block: true }),
    applicableRegulations: normaliseStringListInput(input.applicableRegulations, { maxItems: 12 }),
    citations: normaliseCitationInputs(input.citations),
    results: normaliseResultsInput(input.results),
    fairParams: normaliseFairParamsInput(input.fairParams),
    assessmentIntelligence: normaliseAssessmentIntelligenceInput(input.assessmentIntelligence),
    obligationBasis: normaliseObligationBasisInput(input.obligationBasis),
    traceLabel: normaliseInlineInputText(input.traceLabel || '')
  }) || {};
}

function normaliseParameterChallengeRecordInput(input = {}) {
  return compactInputValue({
    parameterKey: normaliseInlineInputText(input.parameterKey || ''),
    parameterLabel: normaliseInlineInputText(input.parameterLabel || ''),
    currentValue: input.currentValue,
    currentValueLabel: normaliseInlineInputText(input.currentValueLabel || ''),
    scenarioSummary: normaliseBlockInputText(input.scenarioSummary || ''),
    reviewerConcern: normaliseBlockInputText(input.reviewerConcern || ''),
    currentAle: normaliseInlineInputText(input.currentAle || ''),
    allowedParams: normaliseStringListInput(input.allowedParams, { maxItems: 8 }),
    traceLabel: normaliseInlineInputText(input.traceLabel || '')
  }) || {};
}

function normaliseChallengeRecordInput(item = {}) {
  if (!isPlainObject(item)) return undefined;
  return compactInputValue({
    parameter: normaliseInlineInputText(item.parameter || ''),
    concern: normaliseBlockInputText(item.concern || ''),
    reviewerAdjustment: compactInputValue({
      param: normaliseInlineInputText(item?.reviewerAdjustment?.param || ''),
      suggestedValue: normaliseNumericInput(item?.reviewerAdjustment?.suggestedValue),
      aleImpact: normaliseBlockInputText(item?.reviewerAdjustment?.aleImpact || ''),
      rationale: normaliseBlockInputText(item?.reviewerAdjustment?.rationale || '')
    })
  });
}

function normaliseChallengeSynthesisInput(input = {}) {
  return compactInputValue({
    scenarioTitle: normaliseInlineInputText(input.scenarioTitle || ''),
    scenarioSummary: normaliseBlockInputText(input.scenarioSummary || ''),
    baseAleRange: normaliseInlineInputText(input.baseAleRange || ''),
    records: (Array.isArray(input.records) ? input.records : [])
      .map((item) => normaliseChallengeRecordInput(item))
      .filter(Boolean)
      .slice(0, 8),
    traceLabel: normaliseInlineInputText(input.traceLabel || '')
  }) || {};
}

function normaliseConsensusChallengeInput(item = {}) {
  if (!isPlainObject(item)) return undefined;
  return compactInputValue({
    ref: normaliseInlineInputText(item.ref || ''),
    parameter: normaliseInlineInputText(item.parameter || ''),
    concern: normaliseBlockInputText(item.concern || ''),
    proposedValue: normaliseInlineInputText(item.proposedValue || ''),
    impactPct: normaliseNumericInput(item.impactPct),
    aleImpact: normaliseBlockInputText(item.aleImpact || '')
  });
}

function normaliseConsensusRecommendationInput(input = {}) {
  return compactInputValue({
    scenarioTitle: normaliseInlineInputText(input.scenarioTitle || ''),
    scenarioSummary: normaliseBlockInputText(input.scenarioSummary || ''),
    originalAleRange: normaliseInlineInputText(input.originalAleRange || ''),
    adjustedAleRange: normaliseInlineInputText(input.adjustedAleRange || ''),
    projectedAleRange: normaliseInlineInputText(input.projectedAleRange || ''),
    aleChangePct: normaliseNumericInput(input.aleChangePct),
    originalParameters: normaliseFairParamsInput(input.originalParameters),
    adjustedParameters: normaliseFairParamsInput(input.adjustedParameters),
    challenges: (Array.isArray(input.challenges) ? input.challenges : [])
      .map((item) => normaliseConsensusChallengeInput(item))
      .filter(Boolean)
      .slice(0, 8),
    traceLabel: normaliseInlineInputText(input.traceLabel || '')
  }) || {};
}

function normaliseReviewMediationInput(input = {}) {
  return compactInputValue({
    narrative: normaliseBlockInputText(input.narrative || ''),
    fairParams: normaliseFairParamsInput(input.fairParams),
    results: normaliseResultsInput(input.results),
    assessmentIntelligence: normaliseAssessmentIntelligenceInput(input.assessmentIntelligence),
    reviewerView: normaliseBlockInputText(input.reviewerView || ''),
    analystView: normaliseBlockInputText(input.analystView || ''),
    disputedFocus: normaliseInlineInputText(input.disputedFocus || ''),
    scenarioLens: normaliseScenarioLensInput(input.scenarioLens),
    citations: normaliseCitationInputs(input.citations, { maxItems: 4 }),
    traceLabel: normaliseInlineInputText(input.traceLabel || '')
  }) || {};
}

function buildAssessmentChallengeStub(input = {}) {
  const confidence = input.confidence || {};
  const assumptions = Array.isArray(input.assumptions) ? input.assumptions : [];
  const drivers = input.drivers || { upward: [], stabilisers: [] };
  const weakestAssumptions = assumptions.slice(0, 3).map((item) => `${item.category}: ${item.text}`);
  const committeeQuestions = [];
  if (drivers.upward?.[0]) committeeQuestions.push(`What evidence supports the conclusion that ${drivers.upward[0].charAt(0).toLowerCase()}${drivers.upward[0].slice(1)}`);
  if (confidence.label === 'Low confidence') committeeQuestions.push('Which ranges are still too uncertain for strong decision-making and why are they still broad?');
  if ((input.missingInformation || []).length) committeeQuestions.push(`What missing evidence would change the assessment most: ${(input.missingInformation || []).slice(0, 2).join(' and ')}?`);
  if (!committeeQuestions.length) committeeQuestions.push('Which one or two assumptions would most change the tolerance position if they proved wrong?');
  const evidenceToGather = [];
  if ((input.missingInformation || []).length) evidenceToGather.push(...input.missingInformation.slice(0, 3));
  if (!evidenceToGather.length) {
    evidenceToGather.push('Internal incident history or loss data for similar scenarios.');
    evidenceToGather.push('Control evidence showing how consistently the key controls operate in practice.');
    evidenceToGather.push('Finance or operational data to validate the biggest cost assumptions.');
  }
  const challengeLevel = confidence.label === 'Low confidence' ? 'High challenge needed' : confidence.label === 'High confidence' ? 'Moderate challenge still warranted' : 'Targeted challenge recommended';
  return {
    summary: confidence.label === 'Low confidence'
      ? 'The assessment is directionally useful, but a risk committee should challenge the broadest assumptions before relying on it for strong decisions.'
      : 'The assessment is decision-useful, but a risk committee should still test the assumptions that are driving the result most.',
    challengeLevel,
    weakestAssumptions,
    committeeQuestions,
    evidenceToGather,
    reviewerGuidance: [
      'Focus first on the assumptions most likely to move the tolerance position.',
      'Challenge whether the cost and frequency assumptions are supported by internal evidence rather than only judgement.',
      'Confirm that the selected regulatory and business scope still matches the scenario being discussed.'
    ]
  };
}

function buildParameterChallengeStub(input = {}) {
  const parameterLabel = String(input?.parameterLabel || 'parameter').trim();
  const currentValueLabel = String(input?.currentValueLabel || input?.currentValue || '').trim();
  const concern = String(input?.reviewerConcern || '').trim();
  const concernLower = concern.toLowerCase();
  const parameterKey = String(input?.parameterKey || '').trim();
  const numericValue = Number(input?.currentValue);
  const adjustmentDirection = /too low|understat|optimistic|higher|increase|more severe|too weak|not enough/i.test(concernLower)
    ? 'up'
    : /too high|overstat|conservative|lower|decrease|too strong/i.test(concernLower)
      ? 'down'
      : (parameterKey === 'controlStrLikely' ? 'down' : 'up');
  const questions = [
    `What direct evidence supports keeping ${parameterLabel} at ${currentValueLabel || 'the current value'}?`,
    `Which internal record, test result, or source would satisfy the reviewer if you defend this ${parameterLabel.toLowerCase()} estimate?`,
    parameterKey === 'lmLow' || parameterKey === 'lmHigh'
      ? 'Which loss component is doing most of the work in this range, and do you have finance or operations evidence for it?'
      : parameterKey === 'controlStrLikely'
        ? 'What control test, operating evidence, or recent incident data shows the current control strength is realistic?'
        : 'What evidence would make you revise this estimate instead of defending it?'
  ].filter(Boolean).slice(0, 3);
  let suggestedValue = Number.isFinite(numericValue) ? numericValue : 0;
  if (Number.isFinite(numericValue)) {
    if (parameterKey === 'controlStrLikely') {
      suggestedValue = adjustmentDirection === 'up'
        ? Math.min(0.99, numericValue + 0.08)
        : Math.max(0.01, numericValue - 0.08);
    } else if (parameterKey === 'vulnerability') {
      suggestedValue = adjustmentDirection === 'up'
        ? Math.min(0.99, numericValue + 0.08)
        : Math.max(0.01, numericValue - 0.08);
    } else {
      const factor = adjustmentDirection === 'up' ? 1.12 : 0.9;
      suggestedValue = numericValue * factor;
    }
  }
  return {
    analystQuestions: questions,
    reviewerAdjustment: {
      param: parameterKey || parameterLabel,
      suggestedValue: Number.isFinite(suggestedValue) ? Number(suggestedValue.toFixed(parameterKey === 'lmLow' || parameterKey === 'lmHigh' ? 0 : 2)) : numericValue,
      aleImpact: adjustmentDirection === 'up'
        ? 'ALE would likely move upward unless the analyst can narrow the evidence base and defend the current estimate.'
        : 'ALE would likely move downward if the reviewer concern is accepted without new evidence.',
      rationale: concern
        ? `This is the smallest directional adjustment that reflects the reviewer concern: ${concern}`
        : `This is the smallest directional adjustment that reflects a cautious reviewer challenge to ${parameterLabel.toLowerCase()}.`
    }
  };
}

function buildChallengeSynthesisStub(input = {}) {
  const records = Array.isArray(input?.records) ? input.records : [];
  return {
    overallConcern: records.length
      ? `Reviewers are consistently challenging ${String(records[0]?.parameter || 'the current assumptions').toLowerCase()} and the overall severity looks more exposed than the base case suggests.`
      : 'Reviewers are questioning whether the current estimate is too optimistic overall.',
    revisedAleRange: String(input?.baseAleRange || '').trim()
      ? `A prudent committee view would treat the outcome as materially higher than the current ${String(input.baseAleRange).trim()} planning range until the challenged assumptions are defended.`
      : 'A prudent committee view would treat the annual loss range as materially higher until the challenged assumptions are defended.',
    keyEvidence: 'The single best way to resolve most of these challenges is to produce one current evidence pack that proves the disputed control performance and loss-range assumptions together.'
  };
}

function buildConsensusRecommendationStub(input = {}) {
  const challenges = Array.isArray(input?.challenges) ? input.challenges : [];
  const acceptable = challenges
    .filter((item) => Math.abs(Number(item?.impactPct || 0)) <= 15)
    .map((item) => String(item?.ref || '').trim())
    .filter(Boolean);
  const defend = challenges
    .filter((item) => !acceptable.includes(String(item?.ref || '').trim()))
    .map((item) => String(item?.ref || '').trim())
    .filter(Boolean);
  const meetInMiddleAleRange = String(input?.projectedAleRange || input?.adjustedAleRange || input?.originalAleRange || '').trim()
    || 'Use the projected consensus path as the working annual loss range until new evidence closes the challenge.';
  return {
    summaryBullets: [
      challenges.length
        ? 'Accept the smaller committee adjustments first, then defend the changes that would materially reshape the current result without new evidence.'
        : 'Accept the smallest defensible reviewer adjustments first, then defend the assumptions that would materially change the outcome.',
      defend.length
        ? `Defend ${defend.join(', ')} unless the reviewer can show stronger evidence, because those changes would move the outcome materially beyond the current management read.`
        : 'Defend any remaining large-impact changes until stronger evidence shows the base case is too optimistic.',
      `A workable middle ground is ${meetInMiddleAleRange}.`
    ],
    acceptChallenges: acceptable,
    defendChallenges: defend,
    meetInTheMiddleAleRange: meetInMiddleAleRange
  };
}

function buildReviewerDecisionBriefStub(input = {}) {
  const assessmentData = cleanUserFacingText(String(input?.assessmentData || '').trim(), { maxSentences: 4 });
  const sentences = assessmentData
    ? assessmentData.split(/(?<=[.!?])\s+/).map((item) => cleanUserFacingText(item, { maxSentences: 1 })).filter(Boolean)
    : [];
  return {
    whatMatters: sentences[0] || 'The assessment still needs a concise headline risk statement before review.',
    whatsUncertain: sentences[1] || 'The weakest assumption still needs clearer evidence before approval.',
    whatToDo: 'Use the technical detail view to challenge the weakest assumption before approving the current position.'
  };
}

function buildExecutiveChallengeStub(input = {}) {
  const assumptions = Array.isArray(input?.assessmentIntelligence?.assumptions)
    ? input.assessmentIntelligence.assumptions
    : [];
  const firstAssumption = assumptions[0]?.text || assumptions[0] || '';
  const p90 = Number(input?.results?.eventLoss?.p90 || 0);
  const weakestAssumption = cleanUserFacingText(firstAssumption || 'Recovery timing and control-performance assumptions still need direct evidence.', { maxSentences: 1 })
    || 'Recovery timing and control-performance assumptions still need direct evidence.';
  return {
    challengeSummary: p90 > 0
      ? `The assessment may be directionally useful, but the committee should challenge the assumptions carrying the ${p90.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} bad-year view before relying on it.`
      : 'The assessment may be directionally useful, but the committee should challenge the assumptions carrying the severe-loss view before relying on it.',
    weakestAssumption,
    alternativeView: 'A more conservative committee view would assume slower recovery or weaker control performance until direct evidence narrows the range.',
    confidenceVerdict: 'Likely understated',
    oneQuestion: cleanUserFacingText(
      input?.obligationBasis
        ? 'Which direct evidence proves the current control and recovery assumptions still meet the obligations in scope?'
        : 'Which direct evidence proves the current control and recovery assumptions are realistic enough for committee use?',
      { maxSentences: 1 }
    ) || 'Which direct evidence proves the current control and recovery assumptions are realistic enough for committee use?'
  };
}

function normaliseReviewerBrief(parsed = {}) {
  return {
    whatMatters: cleanUserFacingText(parsed.whatMatters || '', { maxSentences: 1 }),
    whatsUncertain: cleanUserFacingText(parsed.whatsUncertain || '', { maxSentences: 1 }),
    whatToDo: cleanUserFacingText(parsed.whatToDo || '', { maxSentences: 1 })
  };
}

function normaliseExecutiveChallenge(parsed = {}) {
  const allowedVerdict = new Set(['Reasonable given evidence', 'Likely overstated', 'Likely understated']);
  const verdict = cleanUserFacingText(parsed.confidenceVerdict || '', { maxSentences: 1 });
  return {
    challengeSummary: cleanUserFacingText(parsed.challengeSummary || '', { maxSentences: 3 }),
    weakestAssumption: cleanUserFacingText(parsed.weakestAssumption || '', { maxSentences: 1 }),
    alternativeView: cleanUserFacingText(parsed.alternativeView || '', { maxSentences: 2 }),
    confidenceVerdict: allowedVerdict.has(verdict) ? verdict : '',
    oneQuestion: cleanUserFacingText(parsed.oneQuestion || '', { maxSentences: 1 })
  };
}

function normaliseReviewChallenge(parsed = {}, stub = {}) {
  return {
    summary: cleanUserFacingText(parsed.summary || stub.summary || '', { maxSentences: 3 }),
    challengeLevel: cleanUserFacingText(parsed.challengeLevel || stub.challengeLevel || '', { maxSentences: 1 }),
    weakestAssumptions: (Array.isArray(parsed.weakestAssumptions) ? parsed.weakestAssumptions : stub.weakestAssumptions).slice(0, 4).map((item) => cleanUserFacingText(item || '', { maxSentences: 1 })).filter(Boolean),
    committeeQuestions: (Array.isArray(parsed.committeeQuestions) ? parsed.committeeQuestions : stub.committeeQuestions).slice(0, 4).map((item) => cleanUserFacingText(item || '', { maxSentences: 1 })).filter(Boolean),
    evidenceToGather: (Array.isArray(parsed.evidenceToGather) ? parsed.evidenceToGather : stub.evidenceToGather).slice(0, 4).map((item) => cleanUserFacingText(item || '', { maxSentences: 1 })).filter(Boolean),
    reviewerGuidance: normaliseGuidance(Array.isArray(parsed.reviewerGuidance) && parsed.reviewerGuidance.length ? parsed.reviewerGuidance : stub.reviewerGuidance)
  };
}

function normaliseParameterChallengeRecord(parsed = {}, stub = {}, allowedParams = []) {
  const analystQuestions = (Array.isArray(parsed?.analystQuestions) ? parsed.analystQuestions : stub.analystQuestions)
    .map((item) => cleanUserFacingText(item || '', { maxSentences: 1 }))
    .filter(Boolean)
    .slice(0, 3);
  const adjustment = parsed?.reviewerAdjustment && typeof parsed.reviewerAdjustment === 'object'
    ? parsed.reviewerAdjustment
    : stub.reviewerAdjustment;
  const param = String(adjustment?.param || stub.reviewerAdjustment.param || '').trim();
  return {
    analystQuestions: analystQuestions.length ? analystQuestions : stub.analystQuestions,
    reviewerAdjustment: {
      param: allowedParams.length && allowedParams.includes(param) ? param : (stub.reviewerAdjustment.param || param),
      suggestedValue: Number.isFinite(Number(adjustment?.suggestedValue))
        ? Number(adjustment.suggestedValue)
        : stub.reviewerAdjustment.suggestedValue,
      aleImpact: cleanUserFacingText(adjustment?.aleImpact || stub.reviewerAdjustment.aleImpact || '', { maxSentences: 1 }) || stub.reviewerAdjustment.aleImpact,
      rationale: cleanUserFacingText(adjustment?.rationale || stub.reviewerAdjustment.rationale || '', { maxSentences: 2 }) || stub.reviewerAdjustment.rationale
    }
  };
}

function normaliseChallengeSynthesis(parsed = {}, stub = {}) {
  return {
    overallConcern: cleanUserFacingText(parsed?.overallConcern || '', { maxSentences: 1 }) || stub.overallConcern,
    revisedAleRange: cleanUserFacingText(parsed?.revisedAleRange || '', { maxSentences: 1 }) || stub.revisedAleRange,
    keyEvidence: cleanUserFacingText(parsed?.keyEvidence || '', { maxSentences: 1 }) || stub.keyEvidence
  };
}

function normaliseConsensusRecommendation(parsed = {}, stub = {}, allowedRefs = []) {
  const cleanRefs = (values) => (Array.isArray(values) ? values : [])
    .map((item) => String(item || '').trim())
    .filter((item) => allowedRefs.includes(item));
  const acceptChallenges = cleanRefs(parsed?.acceptChallenges);
  const defendChallenges = cleanRefs(parsed?.defendChallenges).filter((item) => !acceptChallenges.includes(item));
  const summaryBullets = (Array.isArray(parsed?.summaryBullets) ? parsed.summaryBullets : stub.summaryBullets)
    .map((item) => cleanUserFacingText(item || '', { maxSentences: 1 }))
    .filter(Boolean)
    .slice(0, 3);
  return {
    summaryBullets: summaryBullets.length ? summaryBullets : stub.summaryBullets,
    acceptChallenges: acceptChallenges.length ? acceptChallenges : stub.acceptChallenges,
    defendChallenges: defendChallenges.length ? defendChallenges : stub.defendChallenges,
    meetInTheMiddleAleRange: cleanUserFacingText(parsed?.meetInTheMiddleAleRange || '', { maxSentences: 1 }) || stub.meetInTheMiddleAleRange
  };
}

function normaliseMediation(parsed = {}) {
  const allowedFieldPattern = /^(tef|threatCap|controlStr|vuln|ir|bi|db|rl|tp|rc)(Min|Likely|Max)$/;
  const rawValue = parsed?.recommendedValue;
  const recommendedValue = rawValue == null || rawValue === '' ? null : Number(rawValue);
  return {
    reconciliationSummary: cleanUserFacingText(parsed?.reconciliationSummary || '', { maxSentences: 3 }),
    proposedMiddleGround: cleanUserFacingText(parsed?.proposedMiddleGround || '', { maxSentences: 2 }),
    whyReasonable: cleanUserFacingText(parsed?.whyReasonable || '', { maxSentences: 2 }),
    recommendedField: allowedFieldPattern.test(String(parsed?.recommendedField || '').trim())
      ? String(parsed.recommendedField || '').trim()
      : '',
    recommendedValue: Number.isFinite(recommendedValue) ? recommendedValue : null,
    recommendedValueLabel: cleanUserFacingText(parsed?.recommendedValueLabel || '', { maxSentences: 1 }),
    evidenceToVerify: cleanUserFacingText(parsed?.evidenceToVerify || '', { maxSentences: 1 }),
    continueDiscussionPrompt: cleanUserFacingText(parsed?.continueDiscussionPrompt || '', { maxSentences: 1 })
  };
}

function hasExecutiveChallengeShape(input = {}) {
  if (!input || typeof input !== 'object') return false;
  const hasMeaningfulObject = (value) => !!(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length);
  return hasMeaningfulObject(input.results)
    || hasMeaningfulObject(input.fairParams)
    || hasMeaningfulObject(input.assessmentIntelligence);
}

function hasMeaningfulReviewerBriefInput(assessmentData = '') {
  const text = cleanUserFacingText(String(assessmentData || '').trim(), { maxSentences: 4 });
  const tokens = (text.match(/[a-z0-9]{2,}/gi) || []).length;
  return !!text && (text.length >= 24 || tokens >= 5);
}

function hasMeaningfulParameterChallengeInput(input = {}) {
  const parameterIdentity = String(input?.parameterLabel || input?.parameterKey || '').trim();
  const reviewerConcern = cleanUserFacingText(String(input?.reviewerConcern || '').trim(), { maxSentences: 2 });
  const scenarioSummary = cleanUserFacingText(String(input?.scenarioSummary || '').trim(), { maxSentences: 2 });
  const currentAle = cleanUserFacingText(String(input?.currentAle || '').trim(), { maxSentences: 1 });
  return !!parameterIdentity && !!reviewerConcern && !!(scenarioSummary || currentAle);
}

async function buildReviewerDecisionBriefWorkflow(input = {}) {
  input = normaliseReviewerDecisionBriefInput(input);
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Reviewer decision brief', { maxChars: 120 }) || 'Reviewer decision brief';
  const assessmentData = String(input?.assessmentData || '').trim().slice(0, 2400);
  const stub = buildReviewerDecisionBriefStub(input);
  if (!hasMeaningfulReviewerBriefInput(assessmentData)) {
    return {
      mode: 'manual',
      ...stub,
      usedFallback: false,
      aiUnavailable: false,
      manualReasonCode: 'incomplete_assessment_data',
      manualReasonTitle: 'Manual reviewer brief only',
      manualReasonMessage: 'The server needs a fuller assessment summary before it can generate a reviewer brief.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server manual mode used for reviewer brief because assessment data was too short or incomplete.',
        response: 'The reviewer brief stayed in manual mode because the assessment summary was incomplete.'
      })
    };
  }
  if (!config.proxyConfigured) {
    return {
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'proxy_missing_secret',
      fallbackReasonTitle: 'Deterministic fallback reviewer brief loaded',
      fallbackReasonMessage: 'The hosted AI proxy is not configured, so the server used a deterministic reviewer brief instead.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used for reviewer brief.',
        response: `${stub.whatMatters} ${stub.whatsUncertain} ${stub.whatToDo}`
      })
    };
  }
  const preferredSection = String(input?.preferredSection || '').trim().toLowerCase();
  const preferredPrompt = preferredSection
    ? `The reviewer usually spends the most time on the ${preferredSection.replace(/-/g, ' ')} section, so make that section especially concrete and decision-useful.`
    : '';
  const schema = `{
  "whatMatters": "string",
  "whatsUncertain": "string",
  "whatToDo": "string"
}`;
  const systemPrompt = `You are a risk reviewer at a large technology company. You have 30 seconds to decide whether to approve, challenge, or escalate this assessment. Generate a structured brief with exactly three sections:
WHAT MATTERS: [1 sentence - the headline risk and magnitude]
WHAT'S UNCERTAIN: [1 sentence - the weakest assumption]
WHAT TO DO: [1 sentence - approve / challenge parameter X / escalate]

Return JSON only with this schema:
${schema}`;
  const userPrompt = `${preferredPrompt ? `${preferredPrompt}\n\n` : ''}Assessment data:\n${assessmentData}`;
  try {
    const generation = await callAi(systemPrompt, userPrompt, {
      taskName: 'generateReviewerDecisionBrief',
      maxCompletionTokens: 220,
      timeoutMs: 12000
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, schema, {
      taskName: 'repairReviewerDecisionBrief'
    });
    return {
      mode: 'live',
      ...normaliseReviewerBrief(parsed?.parsed || {}),
      usedFallback: false,
      aiUnavailable: false,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: generation.promptSummary,
        response: generation.text
      })
    };
  } catch (error) {
    const normalisedError = normaliseAiError(error);
    return {
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'reviewer_brief_runtime_error',
      fallbackReasonTitle: 'Deterministic fallback reviewer brief loaded',
      fallbackReasonMessage: 'The reviewer-brief step failed at runtime, so the server used a deterministic reviewer brief instead.',
      fallbackReasonDetail: sanitizeAiText(normalisedError?.message || '', { maxChars: 220 }),
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used after reviewer brief generation failed.',
        response: `${stub.whatMatters} ${stub.whatsUncertain} ${stub.whatToDo}`
      })
    };
  }
}

async function buildChallengeAssessmentWorkflow(input = {}) {
  input = normaliseChallengeAssessmentInput(input);
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Assessment challenge', { maxChars: 120 }) || 'Assessment challenge';
  if (hasExecutiveChallengeShape(input)) {
    const stub = buildExecutiveChallengeStub(input);
    if (!config.proxyConfigured) {
      return {
        mode: 'deterministic_fallback',
        ...stub,
        usedFallback: true,
        aiUnavailable: true,
        fallbackReasonCode: 'proxy_missing_secret',
        fallbackReasonTitle: 'Deterministic fallback executive challenge loaded',
        fallbackReasonMessage: 'The hosted AI proxy is not configured, so the server used a deterministic committee challenge instead.',
        trace: buildTraceEntry({
          label: traceLabel,
          promptSummary: 'Server deterministic fallback used for executive challenge.',
          response: stub.challengeSummary
        })
      };
    }
    const p90 = Number(input?.results?.eventLoss?.p90 || 0);
    const assumptions = Array.isArray(input?.assessmentIntelligence?.assumptions) ? input.assessmentIntelligence.assumptions : [];
    const obligationBasis = buildResolvedObligationPromptBlock(input?.obligationBasis || {}) || '(none)';
    const schema = `{
  "challengeSummary": "string",
  "weakestAssumption": "string",
  "alternativeView": "string",
  "confidenceVerdict": "string",
  "oneQuestion": "string"
}`;
    const userPrompt = [
      `Scenario: ${String(input?.narrative || '').slice(0, 600)}`,
      `P90 loss: ${p90.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`,
      `Key assumptions: ${assumptions.slice(0, 3).map((item) => item?.text || item).filter(Boolean).join('; ')}`,
      `Resolved obligations: ${obligationBasis}`,
      `Control strength: ${input?.fairParams?.controlStrLikely || 'not set'}`,
      `TEF: ${input?.fairParams?.tefMin || ''}–${input?.fairParams?.tefMax || ''}/yr`
    ].join('\n');
    const systemPrompt = `You are a senior risk committee reviewer. Your job is to
challenge this assessment - not accept it. Be constructive but skeptical.
Return JSON only:
${schema}`;
    try {
      const generation = await callAi(systemPrompt, userPrompt, {
        taskName: 'challengeAssessmentExecutive',
        maxCompletionTokens: 400,
        timeoutMs: 20000
      });
      const parsed = await parseOrRepairStructuredJson(generation.text, schema, {
        taskName: 'repairChallengeAssessmentExecutive'
      });
      return {
        mode: 'live',
        ...normaliseExecutiveChallenge(parsed?.parsed || {}),
        usedFallback: false,
        aiUnavailable: false,
        trace: buildTraceEntry({
          label: traceLabel,
          promptSummary: generation.promptSummary,
          response: generation.text
        })
      };
    } catch (error) {
      const normalisedError = normaliseAiError(error);
      return {
        mode: 'deterministic_fallback',
        ...stub,
        usedFallback: true,
        aiUnavailable: true,
        fallbackReasonCode: 'executive_challenge_runtime_error',
        fallbackReasonTitle: 'Deterministic fallback executive challenge loaded',
        fallbackReasonMessage: 'The executive challenge step failed at runtime, so the server used a deterministic committee challenge instead.',
        fallbackReasonDetail: sanitizeAiText(normalisedError?.message || '', { maxChars: 220 }),
        trace: buildTraceEntry({
          label: traceLabel,
          promptSummary: 'Server deterministic fallback used after executive challenge generation failed.',
          response: stub.challengeSummary
        })
      };
    }
  }

  const stub = buildAssessmentChallengeStub(input);
  const evidenceMeta = buildEvidenceMeta({
    citations: input.citations || [],
    businessUnit: input.businessUnit,
    geography: input.geography,
    applicableRegulations: input.applicableRegulations,
    organisationContext: input.narrative,
    uploadedText: Array.isArray(input.assumptions) ? input.assumptions.map((item) => item.text).join('\n') : '',
    adminSettings: input.adminSettings,
    userProfile: input.adminSettings?.userProfileSummary
  });
  if (!config.proxyConfigured) {
    return withEvidenceMeta({
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'proxy_missing_secret',
      fallbackReasonTitle: 'Deterministic fallback challenge review loaded',
      fallbackReasonMessage: 'The hosted AI proxy is not configured, so the server used a deterministic challenge review instead.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used for assessment challenge.',
        response: stub.summary,
        sources: input.citations || []
      })
    }, evidenceMeta);
  }

  const schema = `{
  "summary": "string",
  "challengeLevel": "string",
  "weakestAssumptions": ["string"],
  "committeeQuestions": ["string"],
  "evidenceToGather": ["string"],
  "reviewerGuidance": ["string"]
}`;
  const userPrompt = `Assessment title: ${input.scenarioTitle || 'Untitled assessment'}
Business unit: ${input.businessUnit?.name || input.businessUnitName || 'Unknown'}
Geography: ${input.geography || 'Unknown'}
Scenario narrative: ${input.narrative || ''}
Confidence summary: ${input.confidence?.summary || ''}
Confidence label: ${input.confidence?.label || ''}
Main upward drivers:
${(input.drivers?.upward || []).map((item) => `- ${item}`).join('\n')}
Main stabilisers:
${(input.drivers?.stabilisers || []).map((item) => `- ${item}`).join('\n')}
Assumptions:
${(input.assumptions || []).map((item) => `- ${item.category}: ${item.text}`).join('\n')}
Missing information:
${(input.missingInformation || []).map((item) => `- ${item}`).join('\n')}
Live scoped context:
${buildContextPromptBlock(input.adminSettings || {}, input.businessUnit || null)}
Resolved obligations:
${buildResolvedObligationPromptBlock(input.adminSettings || input.businessUnit || {}) || '(none)'}

Evidence quality context:
${evidenceMeta.promptBlock}`;
  const systemPrompt = `You are a senior risk committee reviewer. Return JSON only with this schema:
${schema}

Instructions:
- act like a risk committee or challenge session reviewer
- do not restate the full scenario
- identify the assumptions most worth challenging
- propose the questions a committee would ask
- suggest the evidence that would most improve confidence
- keep the tone practical, concise, and decision-oriented`;
  try {
    const generation = await callAi(systemPrompt, userPrompt, {
      taskName: 'challengeAssessment',
      maxCompletionTokens: 900,
      timeoutMs: 20000
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, schema, {
      taskName: 'repairChallengeAssessment'
    });
    return withEvidenceMeta({
      mode: 'live',
      ...normaliseReviewChallenge(parsed?.parsed || {}, stub),
      usedFallback: false,
      aiUnavailable: false,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: generation.promptSummary,
        response: generation.text,
        sources: input.citations || []
      })
    }, evidenceMeta);
  } catch (error) {
    const normalisedError = normaliseAiError(error);
    return withEvidenceMeta({
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'challenge_review_runtime_error',
      fallbackReasonTitle: 'Deterministic fallback challenge review loaded',
      fallbackReasonMessage: 'The challenge-review step failed at runtime, so the server used a deterministic challenge review instead.',
      fallbackReasonDetail: sanitizeAiText(normalisedError?.message || '', { maxChars: 220 }),
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used after assessment challenge generation failed.',
        response: stub.summary,
        sources: input.citations || []
      })
    }, evidenceMeta);
  }
}

async function buildParameterChallengeRecordWorkflow(input = {}) {
  input = normaliseParameterChallengeRecordInput(input);
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Parameter challenge record', { maxChars: 120 }) || 'Parameter challenge record';
  const stub = buildParameterChallengeStub(input);
  const allowedParams = Array.isArray(input?.allowedParams)
    ? input.allowedParams.map((item) => String(item || '').trim()).filter(Boolean)
    : ['tefLikely', 'vulnerability', 'lmLow', 'lmHigh', 'controlStrLikely'];
  if (!hasMeaningfulParameterChallengeInput(input)) {
    return {
      mode: 'manual',
      ...stub,
      usedFallback: false,
      aiUnavailable: false,
      manualReasonCode: 'incomplete_parameter_challenge_input',
      manualReasonTitle: 'Manual parameter challenge only',
      manualReasonMessage: 'Add the challenged parameter, reviewer concern, and a short scenario summary before the server can build a parameter challenge record.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server manual mode used for parameter challenge because the request was incomplete.',
        response: 'The parameter challenge stayed in manual mode because the request was incomplete.'
      })
    };
  }
  if (!config.proxyConfigured) {
    return {
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'proxy_missing_secret',
      fallbackReasonTitle: 'Deterministic fallback parameter challenge loaded',
      fallbackReasonMessage: 'The hosted AI proxy is not configured, so the server used a deterministic parameter challenge instead.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used for parameter challenge record.',
        response: stub.reviewerAdjustment?.rationale || '',
      })
    };
  }
  const schema = `{
  "analystQuestions": ["string"],
  "reviewerAdjustment": {
    "param": "string",
    "suggestedValue": "number",
    "aleImpact": "string",
    "rationale": "string"
  }
}`;
  const userPrompt = [
    `Parameter challenged: ${String(input?.parameterLabel || 'Parameter').trim()}`,
    `Current value: ${String(input?.currentValueLabel || input?.currentValue || '').trim()}`,
    String(input?.currentAle || '').trim() ? `Current ALE: ${String(input.currentAle).trim()}` : '',
    `Scenario summary: ${String(input?.scenarioSummary || '').trim().slice(0, 900)}`,
    `Reviewer concern: ${String(input?.reviewerConcern || '').trim().slice(0, 1000)}`
  ].filter(Boolean).join('\n');
  const systemPrompt = `A reviewer has challenged a key parameter in a quantified risk assessment.
Generate two outputs:
A) For the ANALYST: 1-3 specific questions they must answer to defend or revise the estimate. Be precise about what evidence would satisfy the reviewer.
B) For the REVIEWER: the minimum parameter adjustment that would reflect the concern if the analyst cannot provide new evidence. Show the impact on ALE.

Return JSON only with this schema:
${schema}

Allowed reviewerAdjustment.param values: ${allowedParams.join(', ')}`;
  try {
    const generation = await callAi(systemPrompt, userPrompt, {
      taskName: 'generateParameterChallengeRecord',
      maxCompletionTokens: 500,
      timeoutMs: 16000
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, schema, {
      taskName: 'repairParameterChallengeRecord'
    });
    return {
      mode: 'live',
      ...normaliseParameterChallengeRecord(parsed?.parsed || {}, stub, allowedParams),
      usedFallback: false,
      aiUnavailable: false,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: generation.promptSummary,
        response: generation.text
      })
    };
  } catch {
    return {
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'parameter_challenge_runtime_error',
      fallbackReasonTitle: 'Deterministic fallback parameter challenge loaded',
      fallbackReasonMessage: 'The parameter-challenge step failed at runtime, so the server used a deterministic parameter challenge instead.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used after parameter challenge generation failed.',
        response: stub.reviewerAdjustment?.rationale || ''
      })
    };
  }
}

async function buildChallengeSynthesisWorkflow(input = {}) {
  input = normaliseChallengeSynthesisInput(input);
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Challenge synthesis', { maxChars: 120 }) || 'Challenge synthesis';
  const stub = buildChallengeSynthesisStub(input);
  const records = Array.isArray(input?.records)
    ? input.records.filter((item) => item && typeof item === 'object').slice(0, 8)
    : [];
  if (!config.proxyConfigured) {
    return {
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'proxy_missing_secret',
      fallbackReasonTitle: 'Deterministic fallback challenge synthesis loaded',
      fallbackReasonMessage: 'The hosted AI proxy is not configured, so the server used a deterministic challenge synthesis instead.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used for challenge synthesis.',
        response: stub.overallConcern
      })
    };
  }
  if (records.length < 2) {
    return {
      mode: 'manual',
      ...stub,
      usedFallback: false,
      aiUnavailable: false,
      manualReasonCode: 'insufficient_challenge_records',
      manualReasonTitle: 'Manual challenge synthesis only',
      manualReasonMessage: 'At least two saved challenge records are needed before the server can synthesise them.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server manual mode used for challenge synthesis because there were not enough challenge records.',
        response: 'At least two challenge records are needed before synthesis can run.'
      })
    };
  }
  const schema = `{
  "overallConcern": "string",
  "revisedAleRange": "string",
  "keyEvidence": "string"
}`;
  const systemPrompt = `A risk assessment has received separate parameter challenges from reviewers.
Synthesise them into one coherent alternative view for a risk committee.

Return JSON only with this schema:
${schema}

Requirements:
- overallConcern: one sentence on the reviewer's combined concern
- revisedAleRange: one sentence stating the revised ALE range or direction implied by the combined challenges
- keyEvidence: one sentence naming the single most useful new evidence item to resolve most of the challenge

Write as if advising a risk committee. Keep the total to 3 sentences.`;
  const userPrompt = safeJson({
    scenarioTitle: String(input?.scenarioTitle || '').trim(),
    scenarioSummary: String(input?.scenarioSummary || '').trim().slice(0, 1200),
    currentAleRange: String(input?.baseAleRange || '').trim(),
    challenges: records.map((item) => ({
      parameter: String(item?.parameter || '').trim(),
      concern: String(item?.concern || '').trim(),
      reviewerAdjustment: item?.reviewerAdjustment || {}
    }))
  });
  try {
    const generation = await callAi(systemPrompt, userPrompt, {
      taskName: 'generateChallengeSynthesis',
      maxCompletionTokens: 260,
      timeoutMs: 14000
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, schema, {
      taskName: 'repairChallengeSynthesis'
    });
    return {
      mode: 'live',
      ...normaliseChallengeSynthesis(parsed?.parsed || {}, stub),
      usedFallback: false,
      aiUnavailable: false,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: generation.promptSummary,
        response: generation.text
      })
    };
  } catch {
    return {
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'challenge_synthesis_runtime_error',
      fallbackReasonTitle: 'Deterministic fallback challenge synthesis loaded',
      fallbackReasonMessage: 'The challenge-synthesis step failed at runtime, so the server used a deterministic synthesis instead.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used after challenge synthesis failed.',
        response: stub.overallConcern
      })
    };
  }
}

async function buildConsensusRecommendationWorkflow(input = {}) {
  input = normaliseConsensusRecommendationInput(input);
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Consensus recommendation', { maxChars: 120 }) || 'Consensus recommendation';
  const stub = buildConsensusRecommendationStub(input);
  const challenges = Array.isArray(input?.challenges)
    ? input.challenges.filter((item) => item && typeof item === 'object').slice(0, 8)
    : [];
  if (!config.proxyConfigured) {
    return {
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'proxy_missing_secret',
      fallbackReasonTitle: 'Deterministic fallback consensus recommendation loaded',
      fallbackReasonMessage: 'The hosted AI proxy is not configured, so the server used a deterministic consensus recommendation instead.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used for consensus recommendation.',
        response: stub.summaryBullets.join(' ')
      })
    };
  }
  if (!challenges.length) {
    return {
      mode: 'manual',
      ...stub,
      usedFallback: false,
      aiUnavailable: false,
      manualReasonCode: 'no_open_challenges',
      manualReasonTitle: 'Manual consensus only',
      manualReasonMessage: 'At least one open reviewer challenge is needed before the server can suggest a consensus path.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server manual mode used for consensus recommendation because there were no open reviewer challenges.',
        response: 'At least one reviewer challenge is needed before consensus can run.'
      })
    };
  }
  const allowedRefs = challenges.map((item) => String(item?.ref || '').trim()).filter(Boolean);
  const schema = `{
  "summaryBullets": ["string", "string", "string"],
  "acceptChallenges": ["${allowedRefs[0] || 'C1'}"],
  "defendChallenges": ["${allowedRefs[1] || 'C2'}"],
  "meetInTheMiddleAleRange": "string"
}`;
  const systemPrompt = `An analyst's assessment has reviewer challenges.
Original parameters: current estimate.
Original ALE: current estimate.
If all reviewer adjustments applied: adjusted estimate.
Adjusted ALE: adjusted estimate.

Generate a consensus recommendation:
- Which adjustments should the analyst accept? (small ALE impact)
- Which should they defend? (large ALE impact, needs evidence)
- What is the "meet in the middle" ALE range both sides could accept?

Return JSON only with this schema:
${schema}

Rules:
- Use only the supplied challenge refs in acceptChallenges and defendChallenges.
- Write exactly 3 direct bullets for a risk committee.
- Put the committee-friendly projected range in meetInTheMiddleAleRange.`;
  const userPrompt = safeJson({
    scenarioTitle: String(input?.scenarioTitle || '').trim(),
    scenarioSummary: String(input?.scenarioSummary || '').trim().slice(0, 1000),
    originalAleRange: String(input?.originalAleRange || '').trim(),
    adjustedAleRange: String(input?.adjustedAleRange || '').trim(),
    projectedAleRange: String(input?.projectedAleRange || '').trim(),
    aleChangePct: Number(input?.aleChangePct || 0),
    originalParameters: input?.originalParameters || {},
    adjustedParameters: input?.adjustedParameters || {},
    challenges: challenges.map((item) => ({
      ref: String(item?.ref || '').trim(),
      parameter: String(item?.parameter || '').trim(),
      concern: String(item?.concern || '').trim(),
      proposedValue: String(item?.proposedValue || '').trim(),
      impactPct: Number(item?.impactPct || 0),
      aleImpact: String(item?.aleImpact || '').trim()
    }))
  });
  try {
    const generation = await callAi(systemPrompt, userPrompt, {
      taskName: 'generateConsensusRecommendation',
      maxCompletionTokens: 320,
      timeoutMs: 14000
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, schema, {
      taskName: 'repairConsensusRecommendation'
    });
    return {
      mode: 'live',
      ...normaliseConsensusRecommendation(parsed?.parsed || {}, stub, allowedRefs),
      usedFallback: false,
      aiUnavailable: false,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: generation.promptSummary,
        response: generation.text
      })
    };
  } catch {
    return {
      mode: 'deterministic_fallback',
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      fallbackReasonCode: 'consensus_runtime_error',
      fallbackReasonTitle: 'Deterministic fallback consensus recommendation loaded',
      fallbackReasonMessage: 'The consensus step failed at runtime, so the server used a deterministic consensus recommendation instead.',
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used after consensus recommendation failed.',
        response: stub.summaryBullets.join(' ')
      })
    };
  }
}

async function buildReviewMediationWorkflow(input = {}) {
  input = normaliseReviewMediationInput(input);
  const config = getCompassProviderConfig();
  const reviewerView = String(input?.reviewerView || '').trim();
  const analystView = String(input?.analystView || '').trim();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Review mediation', { maxChars: 120 }) || 'Review mediation';
  const buildManualResult = ({ code, title, message, detail = '' } = {}) => ({
    mode: 'manual',
    usedFallback: false,
    aiUnavailable: code !== 'missing_positions',
    reconciliationSummary: message || 'The mediation stayed manual because the server could not produce a live or deterministic proposal.',
    proposedMiddleGround: title || 'Manual mediation recommended',
    whyReasonable: detail || 'Use the reviewer note, analyst response, and current evidence to settle the disagreement manually.',
    recommendedField: '',
    recommendedValue: null,
    recommendedValueLabel: '',
    evidenceToVerify: detail || 'Review the disputed assumption, the current evidence pack, and the latest reviewer note together.',
    continueDiscussionPrompt: 'Keep the discussion manual: restate the disputed assumption, cite the strongest evidence on each side, and agree the one fact that would resolve it.',
    manualReasonCode: code || 'manual_review_required',
    manualReasonTitle: title || 'Manual mediation recommended',
    manualReasonMessage: message || 'The server could not produce a mediation proposal for this discussion.',
    manualReasonDetail: detail,
    trace: buildTraceEntry({
      label: traceLabel,
      promptSummary: 'Server manual mode used for review mediation.',
      response: message || 'The server could not produce a mediation proposal for this discussion.'
    })
  });
  if (!reviewerView || !analystView) {
    return buildManualResult({
      code: 'missing_positions',
      title: 'Manual mediation only',
      message: 'Both the reviewer view and the analyst view are needed before the server can mediate the disagreement.'
    });
  }
  if (!config.proxyConfigured) {
    return buildManualResult({
      code: 'proxy_missing_secret',
      title: 'Manual mediation recommended',
      message: 'The hosted AI proxy is not configured, so this mediation discussion must stay manual for now.',
      detail: 'Use the reviewer note, analyst response, and current evidence pack to work through the disputed assumption.'
    });
  }
  const fairParams = input?.fairParams || {};
  const assumptions = Array.isArray(input?.assessmentIntelligence?.assumptions) ? input.assessmentIntelligence.assumptions : [];
  const drivers = Array.isArray(input?.assessmentIntelligence?.drivers?.sensitivity) ? input.assessmentIntelligence.drivers.sensitivity : [];
  const citations = Array.isArray(input?.citations) ? input.citations.slice(0, 4) : [];
  const schema = `{
  "reconciliationSummary": "string",
  "proposedMiddleGround": "string",
  "whyReasonable": "string",
  "recommendedField": "string",
  "recommendedValue": "number",
  "recommendedValueLabel": "string",
  "evidenceToVerify": "string",
  "continueDiscussionPrompt": "string"
}`;
  const systemPrompt = `You are an AI mediation assistant for enterprise risk reviews.
Resolve focused disagreements between the analyst and the reviewer. Be constructive, specific, and concise.
Return JSON only with this schema:
${schema}`;
  const userPrompt = [
    `Scenario: ${String(input?.narrative || '').slice(0, 700)}`,
    `Scenario lens: ${String(input?.scenarioLens?.label || input?.scenarioLens?.key || 'general')}`,
    `Disputed focus: ${String(input?.disputedFocus || 'Overall assessment').slice(0, 120)}`,
    `Reviewer view: ${reviewerView}`,
    `Analyst view: ${analystView}`,
    `Current P90 event loss: ${Number(input?.results?.eventLoss?.p90 || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`,
    `Current ALE mean: ${Number(input?.results?.ale?.mean || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}`,
    `Current control strength likely: ${fairParams?.controlStrLikely ?? 'not set'}`,
    `Current TEF likely: ${fairParams?.tefLikely ?? 'not set'}`,
    `Key assumptions: ${assumptions.slice(0, 3).map((item) => item?.text || item).filter(Boolean).join('; ') || 'Not stated'}`,
    `Top drivers: ${drivers.slice(0, 3).map((item) => `${item?.label || 'Driver'} - ${item?.why || ''}`).filter(Boolean).join('; ') || 'Not stated'}`,
    `Relevant evidence: ${citations.map((item) => item?.title || item?.sourceTitle || '').filter(Boolean).join('; ') || 'No named evidence provided'}`
  ].join('\n');
  try {
    const generation = await callAi(systemPrompt, userPrompt, {
      taskName: 'mediateAssessmentDispute',
      maxCompletionTokens: 420,
      timeoutMs: 20000
    });
    const parsed = await parseOrRepairStructuredJson(generation.text, schema, {
      taskName: 'repairMediationAssessmentDispute'
    });
    return {
      mode: 'live',
      usedFallback: false,
      aiUnavailable: false,
      ...normaliseMediation(parsed?.parsed || {}),
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: generation.promptSummary,
        response: generation.text
      })
    };
  } catch (error) {
    const normalisedError = normaliseAiError(error);
    return buildManualResult({
      code: 'mediation_runtime_error',
      title: 'Manual mediation recommended',
      message: 'The AI mediation step failed at runtime, so this discussion should stay manual for now.',
      detail: sanitizeAiText(normalisedError?.message || '', { maxChars: 220 })
    });
  }
}

module.exports = {
  buildReviewerDecisionBriefWorkflow,
  buildChallengeAssessmentWorkflow,
  buildParameterChallengeRecordWorkflow,
  buildChallengeSynthesisWorkflow,
  buildConsensusRecommendationWorkflow,
  buildReviewMediationWorkflow
};
