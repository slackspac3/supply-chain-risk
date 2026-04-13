'use strict';

const { requireSession } = require('../_apiAuth');
const { applyCorsHeaders, getUnexpectedFields, isAllowedOrigin, isPlainObject, parseRequestBody } = require('../_request');
const { checkRateLimit } = require('../_rateLimit');
const { buildVendorAssessmentAnalysisWorkflow, normaliseVendorAssessmentInput } = require('../_vendorAssessmentWorkflow');
const { recordAiRouteReuse, withAiRouteMetrics } = require('../_aiRouteMetrics');
const { withWorkflowReuse } = require('../_workflowReuse');

const ALLOWED_FIELDS = [
  'vendorName',
  'contractDescription',
  'serviceScope',
  'serviceTypeHint',
  'scenarioSummary',
  'dataAccessRequired',
  'dataTypes',
  'headquartered',
  'subprocessors',
  'hostingRegion',
  'businessUnit',
  'questionnaireFindings',
  'evidenceSummaries',
  'requiredClauses',
  'existingContractClauses',
  'traceLabel',
  'priorMessages'
];

function getRateLimitKey(req, session) {
  return `ai-vendor-assessment-analysis::${String(session?.username || 'anonymous').trim().toLowerCase()}::${String(req.socket?.remoteAddress || 'unknown')}`;
}

module.exports = async function handler(req, res) {
  applyCorsHeaders(req, res, {
    methods: 'POST,OPTIONS',
    headers: 'content-type,x-session-token'
  });

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  const session = await requireSession(req, res);
  if (!session) return;

  const rateLimit = await checkRateLimit(getRateLimitKey(req, session), {
    maxPerWindow: 30,
    windowMs: 60000
  });
  if (!rateLimit.allowed) {
    res.setHeader('Retry-After', String(rateLimit.retryAfterSeconds));
    res.status(rateLimit.unavailable ? 503 : 429).json({
      error: rateLimit.unavailable ? 'Request throttling is temporarily unavailable' : 'Rate limit exceeded'
    });
    return;
  }

  const body = parseRequestBody(req);
  if (!isPlainObject(body)) {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  const unexpectedFields = getUnexpectedFields(body, ALLOWED_FIELDS);
  if (unexpectedFields.length) {
    res.status(400).json({
      error: 'Unexpected request fields',
      fields: unexpectedFields
    });
    return;
  }

  const normalisedInput = normaliseVendorAssessmentInput(body);
  const routeName = 'vendor-assessment-analysis';
  const result = await withAiRouteMetrics(routeName, () => withWorkflowReuse({
    workflow: routeName,
    scopeKey: String(session?.username || 'anonymous').trim().toLowerCase(),
    fingerprintInput: normalisedInput,
    observeReuseEvent: (event) => recordAiRouteReuse(routeName, event),
    compute: () => buildVendorAssessmentAnalysisWorkflow({
      ...normalisedInput,
      session
    }, {
      traceLabelDefault: 'Vendor assessment analysis'
    })
  }));

  res.status(200).json(result);
};
