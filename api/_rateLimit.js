'use strict';

const { get: kvGet, setex: kvSetex } = require('./_kvStore');

const RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS = 60;

async function checkRateLimit(key, {
  prefix = 'ratelimit::',
  maxPerWindow = 20,
  windowMs = 60000
} = {}) {
  const kvKey = `${String(prefix || 'ratelimit::')}${String(key || '').trim()}`;
  const now = Date.now();
  let entry = { count: 0, resetAt: now + windowMs };

  try {
    const raw = await kvGet(kvKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        const parsedCount = Number(parsed.count || 0);
        const parsedResetAt = Number(parsed.resetAt || parsed.reset || 0);
        if (Number.isFinite(parsedCount) && Number.isFinite(parsedResetAt) && parsedResetAt > now) {
          entry = {
            count: Math.max(0, parsedCount),
            resetAt: parsedResetAt
          };
        }
      }
    }
    if (now > entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
    }
    entry.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    await kvSetex(kvKey, retryAfterSeconds + 5, JSON.stringify(entry));
    if (entry.count > maxPerWindow) {
      return {
        allowed: false,
        retryAfterSeconds,
        unavailable: false
      };
    }
    return {
      allowed: true,
      retryAfterSeconds: 0,
      unavailable: false
    };
  } catch (error) {
    console.error('api/_rateLimit.checkRateLimit failed closed:', error);
    return {
      allowed: false,
      retryAfterSeconds: RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS,
      unavailable: true
    };
  }
}

module.exports = {
  RATE_LIMIT_UNAVAILABLE_RETRY_SECONDS,
  checkRateLimit
};
