'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { extractLlmTextResponse, describeLlmResponse } = require('../../assets/state/llmResponseExtractor.js');

test('extractLlmTextResponse reads chat-completions style content', () => {
  const text = extractLlmTextResponse({
    choices: [
      { message: { content: '{"summary":"ok"}' } }
    ]
  });
  assert.equal(text, '{"summary":"ok"}');
});

test('extractLlmTextResponse reads array content blocks', () => {
  const text = extractLlmTextResponse({
    choices: [
      { message: { content: [{ text: '{"summary":"ok"}' }] } }
    ]
  });
  assert.equal(text, '{"summary":"ok"}');
});

test('extractLlmTextResponse reads responses-style output blocks', () => {
  const text = extractLlmTextResponse({
    output: [
      { content: [{ text: '{"summary":"ok"}' }] }
    ]
  });
  assert.equal(text, '{"summary":"ok"}');
});

test('extractLlmTextResponse returns null for unusable payloads', () => {
  const text = extractLlmTextResponse({
    status: 'ok',
    result: {}
  });
  assert.equal(text, null);
});

test('describeLlmResponse includes inner choice diagnostics when content is empty', () => {
  const response = describeLlmResponse({
    choices: [
      {
        finish_reason: 'stop',
        index: 0,
        message: { role: 'assistant', content: null, refusal: null }
      }
    ]
  });
  assert.equal(response.text, null);
  assert.match(response.diagnostic, /finish_reason: stop/i);
  assert.match(response.diagnostic, /message keys: role, content, refusal/i);
});
