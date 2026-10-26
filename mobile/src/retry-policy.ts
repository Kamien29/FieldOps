/** Bounded exponential backoff for temporary network/5xx/429 failures.
 * Attempts are stored in SQLite meta so restarting Expo does not reset the delay.
 * Manual retry bypasses the delay, but it never discards the outbox.
 */
export const MAX_RETRY_DELAY_MS = 5 * 60_000;
export const FIRST_RETRY_DELAY_MS = 5_000;
export function retryDelayMs(attempt: number): number {
  const n = Math.min(16, Math.max(1, Math.trunc(attempt) || 1));
  return Math.min(MAX_RETRY_DELAY_MS, FIRST_RETRY_DELAY_MS * 2 ** (n - 1));
}
export function nextRetryAt(nowMs: number, attempt: number): number {
  return nowMs + retryDelayMs(attempt);
}
export function shouldRetry(nowMs: number, deadlineMs: number, forced = false): boolean {
  return forced || !Number.isFinite(deadlineMs) || nowMs >= deadlineMs;
}
