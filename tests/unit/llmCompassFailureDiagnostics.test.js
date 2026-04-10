'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLlmService } = require('./helpers/loadLlmServiceHarness');

function configureLocalDirectCompass(service) {
  service.setCompassConfig({
    apiUrl: 'https://api.core42.ai/v1/chat/completions',
    model: 'gpt-local-test',
    apiKey: 'browser-secret'
  });
}

test('failed Compass transport requests are captured in the admin diagnostics log', async () => {
  let fetchCount = 0;
  const service = loadLlmService({
    origin: 'http://127.0.0.1:8080',
    fetchImpl: async () => {
      fetchCount += 1;
      return {
        ok: false,
        status: 502,
        text: async () => `upstream gateway dropped chunk ${fetchCount}`
      };
    }
  });

  configureLocalDirectCompass(service);

  await assert.rejects(
    () => service.testCompassConnection(),
    /LLM API error 502/i
  );

  const entries = service.readAdminCompassFailureLog();
  assert.equal(entries.length, 1);
  assert.equal(fetchCount, 2);
  assert.equal(entries[0].callType, 'direct_compass');
  assert.equal(entries[0].stage, 'http');
  assert.equal(entries[0].statusCode, 502);
  assert.equal(entries[0].attemptCount, 2);
  assert.equal(entries[0].model, 'gpt-local-test');
  assert.equal(entries[0].promptTruncated, false);
  assert.match(String(entries[0].responsePreview || ''), /upstream gateway dropped chunk/i);
  assert.match(String(entries[0].promptSummary || ''), /connectivity check/i);
  assert.equal(entries[0].systemPromptChars > 0, true);
  assert.equal(entries[0].userPromptChars > 0, true);

  service.clearAdminCompassFailureLog();
  assert.equal(service.readAdminCompassFailureLog().length, 0);
});

test('structured-response failures are captured with raw preview and repair diagnostics', async () => {
  let fetchCount = 0;
  const service = loadLlmService({
    origin: 'http://127.0.0.1:8080',
    fetchImpl: async () => {
      fetchCount += 1;
      if (fetchCount === 1) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            choices: [
              {
                message: {
                  content: '{"workingContext":"Role context","preferredOutputs":"Board-ready outputs"'
                }
              }
            ]
          })
        };
      }
      return {
        ok: false,
        status: 502,
        text: async () => 'repair attempt lost the upstream response body'
      };
    }
  });

  configureLocalDirectCompass(service);

  await assert.rejects(
    () => service.buildUserPreferenceAssist({
      userProfile: {
        jobTitle: 'Risk Manager',
        businessUnit: 'Operations',
        department: 'Resilience'
      },
      organisationContext: {
        geography: 'UAE'
      },
      currentSettings: {
        applicableRegulations: ['ISO 22301']
      }
    }),
    (error) => {
      assert.equal(error?.code, 'LLM_UNAVAILABLE');
      return true;
    }
  );

  const entries = service.readAdminCompassFailureLog();
  const parseEntry = entries.find((entry) => entry.taskName === 'buildUserPreferenceAssist' && entry.stage === 'structured_parse');
  assert.ok(parseEntry, 'expected a structured_parse diagnostics entry');
  assert.match(String(parseEntry.responsePreview || ''), /workingContext/i);
  assert.match(String(parseEntry.diagnostic || ''), /Repair attempt failed/i);
  assert.match(String(parseEntry.requestPreview || ''), /Risk Manager/i);
  assert.equal(parseEntry.promptTruncated, false);

  const repairTransportEntry = entries.find((entry) => entry.stage === 'http' && entry.statusCode === 502);
  assert.ok(repairTransportEntry, 'expected the repair transport failure to be logged');
});
