'use strict';

const { get: kvGet } = require('./_kvStore');
const { readSettings } = require('./settings');
const { readUserState } = require('./user-state');

const AI_FEEDBACK_KEY = 'risk_calculator_ai_feedback';
const DAY_MS = 24 * 60 * 60 * 1000;
const FEEDBACK_HALF_LIFE_DAYS = 90;

function toSafeString(value, max = 240) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normaliseScenarioKey(value = '') {
  return toSafeString(value || 'general', 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'general';
}

function normaliseRuntimeMode(value = '') {
  const raw = toSafeString(value, 40).toLowerCase();
  if (raw === 'live_ai' || raw === 'live-ai' || raw === 'live') return 'live_ai';
  if (raw === 'fallback' || raw === 'stub' || raw === 'deterministic_fallback') return 'fallback';
  return 'local';
}

function normaliseFeedbackEvent(event = {}) {
  return {
    target: toSafeString(event.target, 40).toLowerCase(),
    score: Math.max(1, Math.min(5, Math.round(Number(event.score || 0)))),
    runtimeMode: normaliseRuntimeMode(event.runtimeMode),
    buId: toSafeString(event.buId, 80),
    functionKey: toSafeString(event.functionKey, 80).toLowerCase(),
    lensKey: normaliseScenarioKey(event.lensKey || event.scenarioLensKey || event.scenarioType || 'general'),
    reasons: Array.from(new Set((Array.isArray(event.reasons) ? event.reasons : []).map((item) => toSafeString(item, 80).toLowerCase()).filter(Boolean))).slice(0, 6),
    citations: (Array.isArray(event.citations) ? event.citations : [])
      .map((item) => ({
        docId: toSafeString(item?.docId || item?.id, 120),
        title: toSafeString(item?.title || item?.sourceTitle, 180),
        tags: Array.from(new Set((Array.isArray(item?.tags) ? item.tags : []).map((tag) => toSafeString(tag, 60)).filter(Boolean))).slice(0, 8)
      }))
      .filter((item) => item.docId || item.title)
      .slice(0, 8),
    shownRiskTitles: Array.from(new Set((Array.isArray(event.shownRiskTitles) ? event.shownRiskTitles : []).map((item) => toSafeString(item, 180)).filter(Boolean))).slice(0, 10),
    keptRiskTitles: Array.from(new Set((Array.isArray(event.keptRiskTitles) ? event.keptRiskTitles : []).map((item) => toSafeString(item, 180)).filter(Boolean))).slice(0, 10),
    removedRiskTitles: Array.from(new Set((Array.isArray(event.removedRiskTitles) ? event.removedRiskTitles : []).map((item) => toSafeString(item, 180)).filter(Boolean))).slice(0, 10),
    addedRiskTitles: Array.from(new Set((Array.isArray(event.addedRiskTitles) ? event.addedRiskTitles : []).map((item) => toSafeString(item, 180)).filter(Boolean))).slice(0, 10),
    riskTitle: toSafeString(event.riskTitle, 180),
    selectedInAssessment: event.selectedInAssessment === true ? true : event.selectedInAssessment === false ? false : null,
    recordedAt: Number(event.recordedAt || Date.now()),
    submittedBy: toSafeString(event.submittedBy, 120).toLowerCase()
  };
}

function feedbackMatches(event = {}, filters = {}) {
  const buId = toSafeString(filters.buId, 80);
  const functionKey = toSafeString(filters.functionKey, 80).toLowerCase();
  const rawLensKey = toSafeString(filters.scenarioLensKey || filters.lensKey || '', 120).toLowerCase();
  const lensKey = rawLensKey ? normaliseScenarioKey(rawLensKey) : '';
  if (buId && toSafeString(event.buId, 80) !== buId) return false;
  if (functionKey && toSafeString(event.functionKey, 80).toLowerCase() !== functionKey) return false;
  if (lensKey && normaliseScenarioKey(event.lensKey || '') !== lensKey) return false;
  return true;
}

function incrementWeightedMapValue(target, key, amount = 0, max = 180) {
  const safeKey = toSafeString(key || '', max);
  if (!safeKey || !Number.isFinite(amount) || amount === 0) return;
  target[safeKey] = Number(target[safeKey] || 0) + amount;
}

function scaleWeightedMap(target = {}, factor = 1) {
  if (!target || typeof target !== 'object' || !Number.isFinite(factor) || factor === 1) return target;
  Object.keys(target).forEach((key) => {
    target[key] = Number(target[key] || 0) * factor;
  });
  return target;
}

function getFeedbackDecayWeight(recordedAt, now = Date.now()) {
  const timestamp = Number(recordedAt || 0);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return 1;
  const safeNow = Number.isFinite(now) && now > 0 ? now : Date.now();
  const ageMs = Math.max(0, safeNow - timestamp);
  const daysSinceEvent = ageMs / DAY_MS;
  return Math.pow(0.5, daysSinceEvent / FEEDBACK_HALF_LIFE_DAYS);
}

function createEmptyFeedbackProfile() {
  return {
    totalEvents: 0,
    liveAiEvents: 0,
    distinctUsers: 0,
    signalConfidence: 1,
    coldStartDiscountApplied: false,
    runtimeCounts: { live_ai: 0, fallback: 0, local: 0 },
    draft: { count: 0, signalCount: 0, totalScore: 0, averageScore: 0, reasons: {} },
    shortlist: { count: 0, signalCount: 0, totalScore: 0, averageScore: 0, reasons: {} },
    risk: { count: 0, signalCount: 0, totalScore: 0, averageScore: 0, reasons: {} },
    riskWeights: {},
    docWeights: {},
    docTagWeights: {},
    wrongDomainCount: 0,
    weakCitationCount: 0,
    missedRiskCount: 0,
    unrelatedRiskCount: 0,
    usefulWithEditsCount: 0,
    latestAt: 0,
    topPositiveRisks: [],
    topNegativeRisks: [],
    topPositiveDocs: [],
    topNegativeDocs: []
  };
}

function feedbackScoreDelta(score) {
  return (Math.max(1, Math.min(5, Math.round(Number(score || 0)))) - 3) / 2;
}

function applyColdStartDiscountToBucket(bucket, factor = 1) {
  if (!bucket || typeof bucket !== 'object' || !Number.isFinite(factor) || factor === 1) return;
  scaleWeightedMap(bucket.reasons, factor);
  const signalCount = Number(bucket.signalCount || 0);
  const neutralTotal = signalCount * 3;
  bucket.totalScore = neutralTotal + ((Number(bucket.totalScore || 0) - neutralTotal) * factor);
}

function finaliseFeedbackProfile(profile) {
  if (!profile || typeof profile !== 'object') return createEmptyFeedbackProfile();
  const signalConfidence = profile.totalEvents < 3 ? 0.5 : 1;
  profile.signalConfidence = signalConfidence;
  profile.coldStartDiscountApplied = signalConfidence < 1;
  if (signalConfidence < 1) {
    applyColdStartDiscountToBucket(profile.draft, signalConfidence);
    applyColdStartDiscountToBucket(profile.shortlist, signalConfidence);
    applyColdStartDiscountToBucket(profile.risk, signalConfidence);
    scaleWeightedMap(profile.riskWeights, signalConfidence);
    scaleWeightedMap(profile.docWeights, signalConfidence);
    scaleWeightedMap(profile.docTagWeights, signalConfidence);
    profile.wrongDomainCount *= signalConfidence;
    profile.weakCitationCount *= signalConfidence;
    profile.missedRiskCount *= signalConfidence;
    profile.unrelatedRiskCount *= signalConfidence;
    profile.usefulWithEditsCount *= signalConfidence;
  }
  if (profile.draft.signalCount) profile.draft.averageScore = Number((profile.draft.totalScore / profile.draft.signalCount).toFixed(2));
  if (profile.shortlist.signalCount) profile.shortlist.averageScore = Number((profile.shortlist.totalScore / profile.shortlist.signalCount).toFixed(2));
  if (profile.risk.signalCount) profile.risk.averageScore = Number((profile.risk.totalScore / profile.risk.signalCount).toFixed(2));
  profile.topPositiveRisks = Object.entries(profile.riskWeights)
    .filter(([, value]) => Number(value) > 0.35)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([title, weight]) => ({ title, weight: Number(weight.toFixed(2)) }));
  profile.topNegativeRisks = Object.entries(profile.riskWeights)
    .filter(([, value]) => Number(value) < -0.35)
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([title, weight]) => ({ title, weight: Number(weight.toFixed(2)) }));
  profile.topPositiveDocs = Object.entries(profile.docWeights)
    .filter(([, value]) => Number(value) > 0.35)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([docId, weight]) => ({ docId, weight: Number(weight.toFixed(2)) }));
  profile.topNegativeDocs = Object.entries(profile.docWeights)
    .filter(([, value]) => Number(value) < -0.35)
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([docId, weight]) => ({ docId, weight: Number(weight.toFixed(2)) }));
  return profile;
}

function buildFeedbackProfile(events = []) {
  const profile = createEmptyFeedbackProfile();
  const submitters = new Set();
  (Array.isArray(events) ? events : []).forEach((rawEvent) => {
    const event = normaliseFeedbackEvent(rawEvent);
    if (!event.score) return;
    const decayWeight = getFeedbackDecayWeight(event.recordedAt);
    profile.totalEvents += 1;
    profile.latestAt = Math.max(profile.latestAt, Number(event.recordedAt || 0));
    profile.runtimeCounts[event.runtimeMode] = Number(profile.runtimeCounts[event.runtimeMode] || 0) + 1;
    if (event.runtimeMode === 'live_ai') profile.liveAiEvents += 1;
    if (event.submittedBy) submitters.add(event.submittedBy);
    const bucket = event.target === 'shortlist'
      ? profile.shortlist
      : event.target === 'risk'
        ? profile.risk
        : profile.draft;
    bucket.count += 1;
    bucket.signalCount += decayWeight;
    bucket.totalScore += Number(event.score || 0) * decayWeight;
    (Array.isArray(event.reasons) ? event.reasons : []).forEach((reason) => {
      bucket.reasons[reason] = Number(bucket.reasons[reason] || 0) + decayWeight;
      if (reason === 'wrong-domain') profile.wrongDomainCount += decayWeight;
      if (reason === 'weak-citations') profile.weakCitationCount += decayWeight;
      if (reason === 'missed-key-risk') profile.missedRiskCount += decayWeight;
      if (reason === 'included-unrelated-risks') profile.unrelatedRiskCount += decayWeight;
      if (reason === 'useful-with-edits') profile.usefulWithEditsCount += decayWeight;
    });
    if (event.runtimeMode !== 'live_ai') return;
    const rawBaseDelta = feedbackScoreDelta(event.score);
    const baseDelta = rawBaseDelta * decayWeight;
    if (event.target === 'risk') {
      if (event.riskTitle) {
        incrementWeightedMapValue(profile.riskWeights, event.riskTitle, baseDelta * 1.5);
        if (event.selectedInAssessment === true) {
          incrementWeightedMapValue(profile.riskWeights, event.riskTitle, (0.3 + Math.max(0, rawBaseDelta) * 0.5) * decayWeight);
        } else if (event.selectedInAssessment === false) {
          incrementWeightedMapValue(profile.riskWeights, event.riskTitle, (-0.3 + Math.min(0, rawBaseDelta) * 0.5) * decayWeight);
        }
      }
      return;
    }
    const draftWeight = event.target === 'draft' ? 0.9 : 0.45;
    const shortlistWeight = event.target === 'shortlist' ? 0.95 : 0.3;
    (Array.isArray(event.citations) ? event.citations : []).forEach((citation) => {
      const docDelta = baseDelta * (event.target === 'shortlist' ? 1.25 : 1);
      incrementWeightedMapValue(profile.docWeights, citation.docId || citation.title, docDelta, 120);
      (Array.isArray(citation.tags) ? citation.tags : []).forEach((tag) => {
        incrementWeightedMapValue(profile.docTagWeights, tag, docDelta * 0.65, 60);
      });
    });
    (Array.isArray(event.shownRiskTitles) ? event.shownRiskTitles : []).forEach((title) => {
      incrementWeightedMapValue(profile.riskWeights, title, baseDelta * shortlistWeight);
    });
    (Array.isArray(event.keptRiskTitles) ? event.keptRiskTitles : []).forEach((title) => {
      incrementWeightedMapValue(profile.riskWeights, title, (0.7 + Math.max(0, rawBaseDelta) * 0.8) * decayWeight);
    });
    (Array.isArray(event.removedRiskTitles) ? event.removedRiskTitles : []).forEach((title) => {
      incrementWeightedMapValue(profile.riskWeights, title, (-0.85 + Math.min(0, rawBaseDelta) * 0.6) * decayWeight);
    });
    (Array.isArray(event.addedRiskTitles) ? event.addedRiskTitles : []).forEach((title) => {
      incrementWeightedMapValue(profile.riskWeights, title, (0.55 + draftWeight * Math.max(0, rawBaseDelta)) * decayWeight);
    });
  });
  profile.distinctUsers = submitters.size;
  return finaliseFeedbackProfile(profile);
}

function buildInactiveFeedbackProfile(label = '') {
  return {
    active: false,
    label,
    minEvents: 0,
    minUsers: 0,
    profile: createEmptyFeedbackProfile()
  };
}

function buildTierProfile(events = [], { label = '', minEvents = 0, minUsers = 0 } = {}) {
  const profile = buildFeedbackProfile(events);
  const active = profile.liveAiEvents >= minEvents && profile.distinctUsers >= minUsers;
  return {
    active,
    label,
    minEvents,
    minUsers,
    profile
  };
}

function mergeFeedbackTier(combined, tierProfile, weight = 1) {
  const source = tierProfile?.profile;
  if (!tierProfile?.active || !source || !Number.isFinite(weight) || weight <= 0) return combined;
  combined.activeTiers.push(tierProfile.label || 'tier');
  combined.draftPressure += ((Number(source.draft.averageScore || 3) - 3) * weight);
  combined.shortlistPressure += ((Number(source.shortlist.averageScore || 3) - 3) * weight);
  combined.wrongDomainPressure += Number(source.wrongDomainCount || 0) * weight;
  combined.weakCitationPressure += Number(source.weakCitationCount || 0) * weight;
  combined.missedRiskPressure += Number(source.missedRiskCount || 0) * weight;
  combined.unrelatedRiskPressure += Number(source.unrelatedRiskCount || 0) * weight;
  Object.entries(source.riskWeights || {}).forEach(([title, value]) => {
    incrementWeightedMapValue(combined.riskWeights, title, Number(value || 0) * weight);
  });
  Object.entries(source.docWeights || {}).forEach(([docId, value]) => {
    incrementWeightedMapValue(combined.docWeights, docId, Number(value || 0) * weight, 120);
  });
  Object.entries(source.docTagWeights || {}).forEach(([tag, value]) => {
    incrementWeightedMapValue(combined.docTagWeights, tag, Number(value || 0) * weight, 60);
  });
  Object.entries(source.draft.reasons || {}).forEach(([reason, count]) => {
    incrementWeightedMapValue(combined.reasonWeights, `draft:${reason}`, Number(count || 0) * weight, 80);
  });
  Object.entries(source.shortlist.reasons || {}).forEach(([reason, count]) => {
    incrementWeightedMapValue(combined.reasonWeights, `shortlist:${reason}`, Number(count || 0) * weight, 80);
  });
  return combined;
}

function finaliseCombinedFeedback(combined = {}) {
  const next = combined && typeof combined === 'object'
    ? combined
    : {
        activeTiers: [],
        riskWeights: {},
        docWeights: {},
        docTagWeights: {},
        reasonWeights: {},
        draftPressure: 0,
        shortlistPressure: 0,
        wrongDomainPressure: 0,
        weakCitationPressure: 0,
        missedRiskPressure: 0,
        unrelatedRiskPressure: 0
      };
  next.preferredRiskTitles = Object.entries(next.riskWeights || {})
    .filter(([, value]) => Number(value) > 0.35)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([title, weight]) => ({ title, weight: Number(weight.toFixed(2)) }));
  next.avoidRiskTitles = Object.entries(next.riskWeights || {})
    .filter(([, value]) => Number(value) < -0.35)
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([title, weight]) => ({ title, weight: Number(weight.toFixed(2)) }));
  next.preferredDocIds = Object.entries(next.docWeights || {})
    .filter(([, value]) => Number(value) > 0.35)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([docId, weight]) => ({ docId, weight: Number(weight.toFixed(2)) }));
  next.avoidDocIds = Object.entries(next.docWeights || {})
    .filter(([, value]) => Number(value) < -0.35)
    .sort((left, right) => left[1] - right[1] || left[0].localeCompare(right[0]))
    .slice(0, 6)
    .map(([docId, weight]) => ({ docId, weight: Number(weight.toFixed(2)) }));
  next.topIssues = Object.entries(next.reasonWeights || {})
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([reason, weight]) => ({ reason, weight: Number(weight.toFixed(2)) }));
  return next;
}

function getFeedbackTierThresholds(settings = null) {
  const sensitivity = toSafeString(settings?.aiFeedbackTuning?.learningSensitivity, 40).toLowerCase() || 'balanced';
  if (sensitivity === 'accelerated') {
    return {
      learningSensitivity: sensitivity,
      function: { minEvents: 2, minUsers: 2 },
      businessUnit: { minEvents: 3, minUsers: 2 },
      global: { minEvents: 6, minUsers: 3 }
    };
  }
  if (sensitivity === 'conservative') {
    return {
      learningSensitivity: sensitivity,
      function: { minEvents: 4, minUsers: 2 },
      businessUnit: { minEvents: 6, minUsers: 3 },
      global: { minEvents: 10, minUsers: 5 }
    };
  }
  return {
    learningSensitivity: 'balanced',
    function: { minEvents: 3, minUsers: 2 },
    businessUnit: { minEvents: 4, minUsers: 2 },
    global: { minEvents: 8, minUsers: 4 }
  };
}

async function readOrgFeedbackStore() {
  try {
    const raw = await kvGet(AI_FEEDBACK_KEY);
    if (!raw) return { updatedAt: 0, events: [] };
    const parsed = JSON.parse(raw);
    return {
      updatedAt: Number(parsed?.updatedAt || 0),
      events: Array.isArray(parsed?.events) ? parsed.events : []
    };
  } catch (error) {
    console.error('api/_learningAuthority.readOrgFeedbackStore failed:', error);
    return { updatedAt: 0, events: [] };
  }
}

async function resolveHierarchicalFeedbackProfile(context = {}) {
  const username = toSafeString(context.username, 120).toLowerCase();
  const filters = {
    buId: toSafeString(context.buId || context.businessUnitId, 80),
    functionKey: toSafeString(context.functionKey || context.scenarioLens?.functionKey, 80).toLowerCase(),
    scenarioLensKey: normaliseScenarioKey(context.scenarioLensKey || context.scenarioLens?.key || context.lensKey || '')
  };
  const [settings, feedbackStore, userState] = await Promise.all([
    readSettings().catch(() => ({ aiFeedbackTuning: { learningSensitivity: 'balanced' } })),
    readOrgFeedbackStore(),
    username ? readUserState(username).catch(() => null) : Promise.resolve(null)
  ]);
  const thresholds = getFeedbackTierThresholds(settings);
  const orgEvents = (Array.isArray(feedbackStore?.events) ? feedbackStore.events : [])
    .map(normaliseFeedbackEvent)
    .filter((event) => feedbackMatches(event, { scenarioLensKey: filters.scenarioLensKey }));
  const userEvents = (Array.isArray(userState?.learningStore?.aiFeedback?.events) ? userState.learningStore.aiFeedback.events : [])
    .map(normaliseFeedbackEvent)
    .filter((event) => feedbackMatches(event, filters));
  const userProfile = userEvents.length
    ? buildTierProfile(userEvents, { label: 'user', minEvents: 1, minUsers: 1 })
    : buildInactiveFeedbackProfile('user');
  const functionProfile = filters.functionKey
    ? buildTierProfile(orgEvents.filter((event) => feedbackMatches(event, {
        buId: '',
        functionKey: filters.functionKey,
        scenarioLensKey: filters.scenarioLensKey
      })), {
        label: 'function',
        minEvents: thresholds.function.minEvents,
        minUsers: thresholds.function.minUsers
      })
    : buildInactiveFeedbackProfile('function');
  const businessUnitProfile = filters.buId
    ? buildTierProfile(orgEvents.filter((event) => feedbackMatches(event, {
        buId: filters.buId,
        functionKey: '',
        scenarioLensKey: filters.scenarioLensKey
      })), {
        label: 'business-unit',
        minEvents: thresholds.businessUnit.minEvents,
        minUsers: thresholds.businessUnit.minUsers
      })
    : buildInactiveFeedbackProfile('business-unit');
  const globalProfile = buildTierProfile(orgEvents, {
    label: 'global',
    minEvents: thresholds.global.minEvents,
    minUsers: thresholds.global.minUsers
  });
  const combined = finaliseCombinedFeedback([
    { profile: globalProfile.profile, active: globalProfile.active, label: 'global', weight: 1 },
    { profile: businessUnitProfile.profile, active: businessUnitProfile.active, label: 'business-unit', weight: 1.15 },
    { profile: functionProfile.profile, active: functionProfile.active, label: 'function', weight: 1.1 },
    { profile: userProfile.profile, active: userProfile.active, label: 'user', weight: 1.25 }
  ].reduce((accumulator, item) => mergeFeedbackTier(accumulator, item, item.weight), {
    activeTiers: [],
    riskWeights: {},
    docWeights: {},
    docTagWeights: {},
    reasonWeights: {},
    draftPressure: 0,
    shortlistPressure: 0,
    wrongDomainPressure: 0,
    weakCitationPressure: 0,
    missedRiskPressure: 0,
    unrelatedRiskPressure: 0
  }));
  return {
    source: 'server',
    resolvedAt: Date.now(),
    user: userProfile,
    function: functionProfile,
    businessUnit: businessUnitProfile,
    global: globalProfile,
    thresholds,
    combined
  };
}

function buildFeedbackLearningPromptBlock(profile = null) {
  const combined = profile?.combined;
  if (!combined || !Array.isArray(combined.activeTiers) || !combined.activeTiers.length) {
    return 'Feedback priors:\n- No active server-approved live-AI feedback priors are shaping this scenario yet.';
  }
  const issueLabel = (value = '') => String(value || '').replace(/^(draft|shortlist):/, '').replace(/-/g, ' ');
  return [
    'Feedback priors from server-approved live-AI feedback:',
    `- Active tiers: ${combined.activeTiers.join(', ')}`,
    `- Draft pressure: ${combined.draftPressure < -0.25 ? 'tighten and stay closer to the user event path' : combined.draftPressure > 0.25 ? 'current draft patterns are generally landing well' : 'neutral'}`,
    `- Shortlist pressure: ${combined.shortlistPressure < -0.25 ? 'be more selective and avoid off-path risks' : combined.shortlistPressure > 0.25 ? 'current shortlist patterns are generally landing well' : 'neutral'}`,
    combined.wrongDomainPressure > 0 ? '- Repeated server-observed issue: domain drift. Keep the explicit user event path above profile, compliance, and cyber context.' : '',
    combined.weakCitationPressure > 0 ? '- Repeated server-observed issue: weak citations. Prefer documents that directly match the event path and avoid decorative references.' : '',
    combined.wrongDomainPressure > 0 || combined.unrelatedRiskPressure > 0 ? '- Down-rank titles or wording that only reflect downstream consequences, generic governance work, or adjacent domains.' : '',
    combined.weakCitationPressure > 0 ? '- If a source does not directly support the event path, obligation, or consequence chain, leave it out.' : '',
    combined.unrelatedRiskPressure > 0 ? '- Remove shortlist items that do not share the same event tree, even if they are plausible second-order concerns.' : '',
    combined.preferredRiskTitles?.length ? `- Frequently retained risks in similar scenarios: ${combined.preferredRiskTitles.map((item) => item.title).join(', ')}` : '',
    combined.avoidRiskTitles?.length ? `- Frequently removed risks in similar scenarios: ${combined.avoidRiskTitles.map((item) => item.title).join(', ')}` : '',
    combined.topIssues?.length ? `- Common review issues to avoid: ${combined.topIssues.map((item) => issueLabel(item.reason)).join(', ')}` : '',
    '- Use these priors to refine ranking and wording only. They must not override an explicit user event path.'
  ].filter(Boolean).join('\n');
}

function lookupFeedbackRiskWeight(feedbackProfile = null, title = '') {
  if (!feedbackProfile || typeof feedbackProfile !== 'object' || !title) return 0;
  const target = toSafeString(title, 180).toLowerCase();
  return Object.entries(feedbackProfile.riskWeights || {}).reduce((best, [key, value]) => {
    return toSafeString(key, 180).toLowerCase() === target ? Number(value || 0) : best;
  }, 0);
}

function rerankRiskCardsWithFeedback(risks = [], feedbackProfile = null) {
  const combined = feedbackProfile?.combined;
  if (!combined || !Array.isArray(risks) || !risks.length) return Array.isArray(risks) ? risks : [];
  return risks
    .map((risk, index) => {
      const weight = lookupFeedbackRiskWeight(combined, risk?.title || '');
      const confidence = toSafeString(risk?.confidence, 20).toLowerCase();
      const confidenceScore = confidence === 'high' ? 1.2 : confidence === 'medium' ? 0.5 : confidence === 'low' ? -0.2 : 0;
      return {
        risk,
        index,
        score: weight * 1.9 + confidenceScore
      };
    })
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.risk);
}

module.exports = {
  buildFeedbackLearningPromptBlock,
  getFeedbackTierThresholds,
  resolveHierarchicalFeedbackProfile,
  rerankRiskCardsWithFeedback
};
