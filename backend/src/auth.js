import crypto from 'node:crypto';

const SECRET = process.env.TOKEN_SECRET || 'dev-secret-change-me';
const TTL_MS = 30 * 24 * 3600 * 1000;
export const TOKEN_TTL_SECONDS = TTL_MS / 1000;

const mac = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('hex');

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}

export function verifyPassword(pw, stored) {
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex');
  const b = crypto.scryptSync(pw, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function signToken(userId, now = Date.now()) {
  const payload = `${userId}.${now + TTL_MS}`;
  return `${payload}.${mac(payload)}`;
}

/** Returns userId or null. */
export function verifyToken(token) {
  if (!token) return null;
  const i = token.lastIndexOf('.');
  if (i < 0) return null;
  const payload = token.slice(0, i);
  const sig = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(mac(payload));
  if (sig.length !== expected.length || !crypto.timingSafeEqual(sig, expected)) return null;
  const [userId, expiry] = payload.split('.');
  return Number(expiry) > Date.now() ? userId : null;
}
