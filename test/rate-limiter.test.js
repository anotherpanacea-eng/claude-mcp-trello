import test from 'node:test';
import assert from 'node:assert/strict';

import { TokenBucketRateLimiter } from '../build/rate-limiter.js';

test('TokenBucketRateLimiter makes a token available on the expected timescale', async () => {
  const limiter = new TokenBucketRateLimiter(1, 100);

  assert.equal(limiter.canMakeRequest(), true);
  assert.equal(limiter.canMakeRequest(), false);

  const start = Date.now();
  await limiter.waitForAvailableToken();
  const elapsed = Date.now() - start;

  assert.ok(elapsed >= 50, `expected limiter to wait for refill, got ${elapsed}ms`);
  assert.ok(elapsed < 400, `expected limiter wait to stay bounded, got ${elapsed}ms`);
});
