'use strict';

const { getCompassProviderConfig } = require('./_aiRuntime');
const { buildTraceEntry, callAi, normaliseAiError, parseOrRepairStructuredJson, sanitizeAiText } = require('./_aiOrchestrator');
const { workflowUtils } = require('./_scenarioDraftWorkflow');

const {
  buildContextPromptBlock,
  buildEvidenceMeta,
  buildResolvedObligationPromptBlock,
  cleanUserFacingText,
  normaliseGuidance,
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

async function buildReviewerDecisionBriefWorkflow(input = {}) {
  const config = getCompassProviderConfig();
  const assessmentData = String(input?.assessmentData || '').trim().slice(0, 2400);
  if (!config.proxyConfigured || !assessmentData) return null;
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
      ...normaliseReviewerBrief(parsed?.parsed || {}),
      trace: buildTraceEntry({
        label: sanitizeAiText(input.traceLabel || 'Reviewer decision brief', { maxChars: 120 }) || 'Reviewer decision brief',
        promptSummary: generation.promptSummary,
        response: generation.text
      })
    };
  } catch {
    return null;
  }
}

async function buildChallengeAssessmentWorkflow(input = {}) {
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Assessment challenge', { maxChars: 120 }) || 'Assessment challenge';
  if (hasExecutiveChallengeShape(input)) {
    if (!config.proxyConfigured) return null;
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
        ...normaliseExecutiveChallenge(parsed?.parsed || {}),
        trace: buildTraceEntry({
          label: traceLabel,
          promptSummary: generation.promptSummary,
          response: generation.text
        })
      };
    } catch {
      return null;
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
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
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
    throw normaliseAiError(error);
  }
}

async function buildParameterChallengeRecordWorkflow(input = {}) {
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Parameter challenge record', { maxChars: 120 }) || 'Parameter challenge record';
  const stub = buildParameterChallengeStub(input);
  const allowedParams = Array.isArray(input?.allowedParams)
    ? input.allowedParams.map((item) => String(item || '').trim()).filter(Boolean)
    : ['tefLikely', 'vulnerability', 'lmLow', 'lmHigh', 'controlStrLikely'];
  if (!config.proxyConfigured) {
    return {
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
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
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used after parameter challenge generation failed.',
        response: stub.reviewerAdjustment?.rationale || ''
      })
    };
  }
}

async function buildChallengeSynthesisWorkflow(input = {}) {
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Challenge synthesis', { maxChars: 120 }) || 'Challenge synthesis';
  const stub = buildChallengeSynthesisStub(input);
  const records = Array.isArray(input?.records)
    ? input.records.filter((item) => item && typeof item === 'object').slice(0, 8)
    : [];
  if (!config.proxyConfigured) {
    return {
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used for challenge synthesis.',
        response: stub.overallConcern
      })
    };
  }
  if (records.length < 2) return null;
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
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used after challenge synthesis failed.',
        response: stub.overallConcern
      })
    };
  }
}

async function buildConsensusRecommendationWorkflow(input = {}) {
  const config = getCompassProviderConfig();
  const traceLabel = sanitizeAiText(input.traceLabel || 'Consensus recommendation', { maxChars: 120 }) || 'Consensus recommendation';
  const stub = buildConsensusRecommendationStub(input);
  const challenges = Array.isArray(input?.challenges)
    ? input.challenges.filter((item) => item && typeof item === 'object').slice(0, 8)
    : [];
  if (!config.proxyConfigured) {
    return {
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used for consensus recommendation.',
        response: stub.summaryBullets.join(' ')
      })
    };
  }
  if (!challenges.length) return stub;
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
      ...stub,
      usedFallback: true,
      aiUnavailable: true,
      trace: buildTraceEntry({
        label: traceLabel,
        promptSummary: 'Server deterministic fallback used after consensus recommendation failed.',
        response: stub.summaryBullets.join(' ')
      })
    };
  }
}

async function buildReviewMediationWorkflow(input = {}) {
  const config = getCompassProviderConfig();
  const reviewerView = String(input?.reviewerView || '').trim();
  const analystView = String(input?.analystView || '').trim();
  if (!config.proxyConfigured || !reviewerView || !analystView) return null;
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
      ...normaliseMediation(parsed?.parsed || {}),
      trace: buildTraceEntry({
        label: sanitizeAiText(input.traceLabel || 'Review mediation', { maxChars: 120 }) || 'Review mediation',
        promptSummary: generation.promptSummary,
        response: generation.text
      })
    };
  } catch {
    return null;
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
