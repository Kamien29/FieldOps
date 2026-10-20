import crypto from 'node:crypto';

const TTL_MS = 30 * 24 * 3600 * 1000;
export const TOKEN_TTL_SECONDS = TTL_MS / 1000;

function secret() {
  const value = process.env.TOKEN_SECRET;
  if (!value || value.length < 32 || value === 'dev-secret-change-me') {
    throw new Error('TOKEN_SECRET must be set to a strong secret of at least 32 characters');
  }
  return value;
}
const mac = (payload) => crypto.createHmac('sha256', secret()).update(payload).digest('hex');
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  if (typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 2 || !/^[a-f\d]{32}$/i.test(parts[0]) || !/^[a-f\d]{64}$/i.test(parts[1])) return false;
  const actual = Buffer.from(parts[1], 'hex');
  const attempt = crypto.scryptSync(pw, parts[0], 32);
  return crypto.timingSafeEqual(actual, attempt);
}
export function signToken(userId, now = Date.now()) {
  const payload = `${userId}.${now + TTL_MS}`;
  return `${payload}.${mac(payload)}`;
}
export function verifyToken(token) {
  if (typeof token !== 'string' || token.length > 4096) return null;
  const dot = token.lastIndexOf('.');
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!/^[a-f\d]{64}$/i.test(signature)) return null;
  const expected = mac(payload);
  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const i = payload.lastIndexOf('.');
  if (i < 1) return null;
  const userId = payload.slice(0, i);
  const expires = Number(payload.slice(i + 1));
  return Number.isSafeInteger(expires) && expires > Date.now() ? userId : null;
}
