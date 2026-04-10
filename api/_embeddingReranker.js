'use strict';

const { callAi, parseOrRepairStructuredJson, sanitizeAiText } = require('./_aiOrchestrator');

const DEFAULT_TOP_K = 5;
const MAX_CANDIDATE_DOCS = 8;
const RERANK_TIMEOUT_MS = 15000;
const RERANK_SCHEMA = `{
  "scores": [
    {
      "index": 0,
      "relevance": 0,
      "reason": "string"
    }
  ]
}`;

function clampRelevanceScore(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(10, parsed));
}

function buildPromptCandidate(doc = {}, index = 0) {
  return {
    index,
    title: sanitizeAiText(doc.title || doc.sourceTitle || doc.note || `Reference ${index + 1}`, { maxChars: 180 }),
    excerpt: sanitizeAiText(doc.excerpt || doc.description || doc.note || '', { maxChars: 320 }),
    sourceType: sanitizeAiText(doc.sourceType || '', { maxChars: 60 }),
    relevanceReason: sanitizeAiText(doc.relevanceReason || '', { maxChars: 180 }),
    retrievalScore: Number.isFinite(Number(doc.score)) ? Number(doc.score) : 0
  };
}

function buildRerankPrompt(query = '', candidates = []) {
  const queryBlock = sanitizeAiText(query, { maxChars: 1200 }) || '(none)';
  const candidateBlock = candidates.map((candidate) => [
    `${candidate.index}. ${candidate.title || `Reference ${candidate.index + 1}`}`,
    candidate.sourceType ? `type: ${candidate.sourceType}` : '',
    candidate.relevanceReason ? `current reason: ${candidate.relevanceReason}` : '',
    candidate.excerpt ? `excerpt: ${candidate.excerpt}` : '',
    `retrieval score: ${candidate.retrievalScore}`
  ].filter(Boolean).join(' | ')).join('\n');

  return `Query:
${queryBlock}

Candidate documents:
${candidateBlock}

Score each candidate on a 0-10 scale for how directly it grounds this exact scenario.
Reward direct event-path relevance, affected asset match, and consequence fit.
Penalize generic governance or adjacent-domain material that does not directly support this scenario.
Return JSON only.`;
}

async function rerankWithEmbeddings(query, candidateDocs, { topK = DEFAULT_TOP_K } = {}) {
  const docs = (Array.isArray(candidateDocs) ? candidateDocs : []).filter(Boolean).slice(0, MAX_CANDIDATE_DOCS);
  const limit = Math.max(1, Math.min(Number(topK) || DEFAULT_TOP_K, docs.length || DEFAULT_TOP_K));
  const safeQuery = String(query || '').trim();
  if (!safeQuery || docs.length <= 1) return docs.slice(0, limit);

  const promptCandidates = docs.map((doc, index) => buildPromptCandidate(doc, index));
  const systemPrompt = `You are a retrieval reranker for an enterprise risk workflow.

Score each candidate document for relevance to the user query on a 0-10 scale.
- prioritise documents that directly match the scenario event path, asset, cause, and consequence
- do not reward generic compliance, policy, governance, or technology references unless they clearly ground this exact scenario
- return JSON only using the required schema`;
  const response = await callAi(systemPrompt, buildRerankPrompt(safeQuery, promptCandidates), {
    taskName: 'embeddingReranker',
    temperature: 0,
    maxCompletionTokens: 900,
    maxPromptChars: 10000,
    timeoutMs: RERANK_TIMEOUT_MS
  });
  const parsed = await parseOrRepairStructuredJson(response.text, RERANK_SCHEMA, {
    taskName: 'repairEmbeddingReranker',
    timeoutMs: 10000,
    maxCompletionTokens: 1000,
    maxPromptChars: 10000
  });
  const scoredRows = Array.isArray(parsed?.parsed?.scores) ? parsed.parsed.scores : [];
  if (!scoredRows.length) return docs.slice(0, limit);

  const scoreByIndex = new Map();
  scoredRows.forEach((row) => {
    const index = Number(row?.index);
    if (!Number.isInteger(index) || index < 0 || index >= docs.length) return;
    scoreByIndex.set(index, {
      relevance: clampRelevanceScore(row?.relevance),
      reason: sanitizeAiText(row?.reason || '', { maxChars: 180 })
    });
  });
  if (!scoreByIndex.size) return docs.slice(0, limit);

  return docs
    .map((doc, index) => {
      const reranked = scoreByIndex.get(index);
      if (!reranked) return { ...doc };
      return {
        ...doc,
        score: reranked.relevance,
        relevanceReason: reranked.reason || doc.relevanceReason || ''
      };
    })
    .sort((left, right) => (
      Number(right?.score || 0) - Number(left?.score || 0)
      || String(left?.title || '').localeCompare(String(right?.title || ''))
    ))
    .slice(0, limit);
}

module.exports = {
  rerankWithEmbeddings
};
