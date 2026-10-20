import test from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../src/auth.js';

process.env.TOKEN_SECRET = 'test-only-not-for-production-superlong-random-secret';
test('password hashes verify and are salted', () => {
  const x = hashPassword('pass123456');
  const y = hashPassword('pass123456');
  assert.notEqual(x, y);
  assert.equal(verifyPassword('pass123456',x), true);
  assert.equal(verifyPassword('wrong',x), false);
  assert.equal(verifyPassword('pass123456','malformed'), false);
});
test('token expiry and forgery are rejected', () => {
  const token = signToken('u-user-00000000000000000001');
  assert.equal(verifyToken(token), 'u-user-00000000000000000001');
  assert.equal(verifyToken(token+'a'), null);
  assert.equal(verifyToken('bad'), null);
  assert.equal(verifyToken(signToken('u-old', Date.now() - 31*24*3600*1000)), null);
});
