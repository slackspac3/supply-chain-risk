'use strict';

(function bootstrapReleaseMetadata() {
  const release = Object.freeze({
    version: '0.10.0-pilot.1',
    channel: 'pilot',
    build: '2026-04-13-pages-hosting',
    assetVersion: '20260413v4',
    apiOrigin: 'https://supply-chain-risk-two.vercel.app'
  });

  if (typeof globalThis !== 'undefined' && globalThis) {
    globalThis.__RISK_CALCULATOR_RELEASE__ = release;
  }
})();
