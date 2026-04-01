const crypto = require('crypto');
const REVIEW_QUEUE_KEY = 'risk_calculator_review_queue';
const { sendApiError, requireSession } = require('./_apiAuth');
const { applyCorsHeaders, getUnexpectedFields, isAllowedOrigin, isPlainObject, parseRequestBody } = require('./_request');
const { get: kvGet, set: kvSet } = require('./_kvStore');

function normaliseQueueArray(value) {
  return Array.isArray(value) ? value.filter(item => item && typeof item === 'object') : [];
}

async function readQueue() {
  try {
    const raw = await kvGet(REVIEW_QUEUE_KEY);
    if (!raw) return [];
    return normaliseQueueArray(JSON.parse(raw));
  } catch (error) {
    console.error('api/review-queue.readQueue failed to parse stored review queue:', error);
    return [];
  }
}

async function writeQueue(arr) {
  await kvSet(REVIEW_QUEUE_KEY, JSON.stringify(normaliseQueueArray(arr)));
}

function toSafeString(value) {
  return String(value || '').trim();
}

function toSafeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function toNumberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function buildReviewItem(assessment = {}) {
  const results = isPlainObject(assessment.results) ? assessment.results : {};
  const eventLoss = isPlainObject(results.eventLoss) ? results.eventLoss : {};
  const ale = isPlainObject(results.ale) ? results.ale : {};
  return {
    id: `rq_${crypto.randomUUID()}`,
    assessmentId: toSafeString(assessment.id),
    submittedBy: toSafeUsername(assessment.submittedBy),
    submittedAt: Date.now(),
    buId: toSafeString(assessment.buId),
    buName: toSafeString(assessment.buName),
    scenarioTitle: toSafeString(assessment.scenarioTitle),
    toleranceBreached: !!results.toleranceBreached,
    nearTolerance: !!results.nearTolerance,
    annualReviewTriggered: !!results.annualReviewTriggered,
    p90Loss: toNumberOrZero(eventLoss.p90),
    aleMean: toNumberOrZero(ale.mean),
    reviewStatus: 'pending',
    reviewNote: '',
    reviewedBy: '',
    reviewedAt: 0,
    escalatedTo: ''
  };
}

module.exports = async function handler(req, res) {
  const body = parseRequestBody(req);
  applyCorsHeaders(req, res, {
    methods: 'GET,POST,PATCH,OPTIONS',
    headers: 'content-type,x-session-token'
  });

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const origin = req.headers.origin;
  if (origin && !isAllowedOrigin(origin)) {
    sendApiError(res, 403, 'FORBIDDEN', 'Request origin is not allowed.');
    return;
  }

  if ((req.method === 'POST' || req.method === 'PATCH') && !req.headers['content-type']?.includes('application/json')) {
    sendApiError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json');
    return;
  }

  if ((req.method === 'POST' || req.method === 'PATCH') && !isPlainObject(body)) {
    sendApiError(res, 400, 'VALIDATION_ERROR', 'Invalid request body.');
    return;
  }

  try {
    if (req.method === 'GET') {
      const session = requireSession(req, res, { roles: ['admin', 'bu_admin', 'function_admin'] });
      if (!session) return;
      const queue = await readQueue();
      const buId = toSafeString(req.query?.buId);
      const items = buId ? queue.filter(item => toSafeString(item.buId) === buId) : queue;
      res.status(200).json({ items });
      return;
    }

    if (req.method === 'POST') {
      const session = requireSession(req, res);
      if (!session) return;
      if (getUnexpectedFields(body, ['assessment']).length) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Unexpected fields were included in the review submission.');
        return;
      }
      const assessment = isPlainObject(body.assessment) ? body.assessment : null;
      if (!assessment) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'assessment payload is required.');
        return;
      }
      const assessmentId = toSafeString(assessment.id);
      const submittedBy = toSafeUsername(assessment.submittedBy);
      if (!assessmentId || !submittedBy) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Assessment id and submittedBy are required.');
        return;
      }
      const queue = await readQueue();
      const duplicate = queue.find(item => toSafeString(item.assessmentId) === assessmentId && toSafeString(item.reviewStatus) === 'pending');
      if (duplicate) {
        sendApiError(res, 409, 'ALREADY_SUBMITTED', 'Assessment is already pending review.');
        return;
      }
      const item = buildReviewItem(assessment);
      queue.unshift(item);
      await writeQueue(queue);
      res.status(200).json({ item });
      return;
    }

    if (req.method === 'PATCH') {
      const session = requireSession(req, res, { roles: ['admin', 'bu_admin'] });
      if (!session) return;
      if (getUnexpectedFields(body, ['escalatedTo', 'id', 'reviewNote', 'reviewStatus', 'reviewedBy']).length) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Unexpected fields were included in the review update.');
        return;
      }
      const reviewId = toSafeString(body.id);
      const reviewStatus = toSafeString(body.reviewStatus).toLowerCase();
      const validStatuses = new Set(['approved', 'changes_requested', 'escalated']);
      if (!reviewId) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'Review id is required.');
        return;
      }
      if (!validStatuses.has(reviewStatus)) {
        sendApiError(res, 400, 'VALIDATION_ERROR', 'reviewStatus must be approved, changes_requested, or escalated.');
        return;
      }
      const queue = await readQueue();
      const index = queue.findIndex(item => toSafeString(item.id) === reviewId);
      if (index < 0) {
        sendApiError(res, 404, 'NOT_FOUND', 'Review item was not found.');
        return;
      }
      const current = queue[index];
      const updated = {
        ...current,
        reviewStatus,
        reviewNote: toSafeString(body.reviewNote),
        reviewedBy: toSafeUsername(body.reviewedBy),
        reviewedAt: Date.now(),
        escalatedTo: toSafeUsername(body.escalatedTo)
      };
      queue[index] = updated;
      await writeQueue(queue);
      res.status(200).json({ item: updated });
      return;
    }

    sendApiError(res, 405, 'METHOD_NOT_ALLOWED', 'Method not allowed.');
  } catch (error) {
    console.error('Review queue request failed.', error);
    sendApiError(res, 500, 'REVIEW_QUEUE_ERROR', 'The review queue could not be processed.');
  }
};
