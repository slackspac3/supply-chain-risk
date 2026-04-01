'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createMemoryStorage(seed = {}) {
  const store = new Map(Object.entries(seed).map(([key, value]) => [String(key), String(value)]));
  return {
    get length() {
      return store.size;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    getItem(key) {
      return store.has(String(key)) ? store.get(String(key)) : null;
    },
    setItem(key, value) {
      store.set(String(key), String(value));
    },
    removeItem(key) {
      store.delete(String(key));
    },
    clear() {
      store.clear();
    }
  };
}

function loadAuthService({ sessionSeed = {}, localSeed = {} } = {}) {
  const filePath = path.resolve(__dirname, '../../assets/services/authService.js');
  const source = `${fs.readFileSync(filePath, 'utf8')}\nmodule.exports = AuthService;\n`;
  const sessionStorage = createMemoryStorage(sessionSeed);
  const localStorage = createMemoryStorage(localSeed);
  const context = {
    module: { exports: {} },
    exports: {},
    console,
    URL,
    fetch: async () => ({
      ok: true,
      json: async () => ({ users: [] })
    }),
    window: {
      location: {
        origin: 'http://127.0.0.1:8080'
      }
    },
    sessionStorage,
    localStorage
  };
  context.global = context;
  context.globalThis = context;
  vm.runInNewContext(source, context, { filename: filePath });
  return {
    AuthService: context.module.exports,
    sessionStorage,
    localStorage
  };
}

test('logout clears session-scoped trust and preview state without removing unrelated session keys', () => {
  const { AuthService, sessionStorage, localStorage } = loadAuthService({
    sessionSeed: {
      rq_auth_session: JSON.stringify({
        user: {
          username: 'alex',
          displayName: 'Alex Example',
          role: 'user'
        }
      }),
      rq_results_tab__alex: 'technical',
      'rq_boardroom__assessment-1': '1',
      rq_admin_workspace_preview: '1',
      rip_ai_trace: JSON.stringify([{ taskName: 'Step 1 guided draft' }]),
      rip_flags_generated: JSON.stringify({ alex: ['flag-1'] }),
      rip_flags_session_id: 'session-1',
      rip_rag_warned: '1',
      unrelated_session_key: 'keep-me'
    },
    localSeed: {
      rq_auth_accounts_cache: JSON.stringify([{ username: 'alex' }]),
      rq_admin_api_secret: 'legacy-secret',
      persistent_user_data: 'keep-me'
    }
  });

  AuthService.logout();

  assert.equal(sessionStorage.getItem('rq_auth_session'), null);
  assert.equal(sessionStorage.getItem('rq_results_tab__alex'), null);
  assert.equal(sessionStorage.getItem('rq_boardroom__assessment-1'), null);
  assert.equal(sessionStorage.getItem('rq_admin_workspace_preview'), null);
  assert.equal(sessionStorage.getItem('rip_ai_trace'), null);
  assert.equal(sessionStorage.getItem('rip_flags_generated'), null);
  assert.equal(sessionStorage.getItem('rip_flags_session_id'), null);
  assert.equal(sessionStorage.getItem('rip_rag_warned'), null);
  assert.equal(sessionStorage.getItem('unrelated_session_key'), 'keep-me');

  assert.equal(localStorage.getItem('rq_auth_accounts_cache'), null);
  assert.equal(localStorage.getItem('rq_admin_api_secret'), null);
  assert.equal(localStorage.getItem('persistent_user_data'), 'keep-me');
});
