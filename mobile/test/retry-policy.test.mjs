import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDelayMs,nextRetryAt,shouldRetry} from '../src/retry-policy.ts';
test('transient retry backs off exponentially and caps at 5 minutes',()=>{
  assert.deepEqual([1,2,3,4,5].map(retryDelayMs),[5000,10000,20000,40000,80000]);
  assert.equal(retryDelayMs(20),300_000);
  assert.equal(retryDelayMs(-1),5_000);
});
test('automatic retry waits; manual retry always overrides deadline',()=>{
  assert.equal(nextRetryAt(1_000,2),11_000);
  assert.equal(shouldRetry(5000,10_000),false);
  assert.equal(shouldRetry(10_000,10_000),true);
  assert.equal(shouldRetry(5000,10_000,true),true);
});
