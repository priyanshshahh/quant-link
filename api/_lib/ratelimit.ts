/**
 * Sliding-window in-memory rate limiter.
 *
 * Scope/honesty note: state lives in the warm lambda instance, so the limit
 * is per-instance, not global. That is fine for the goal here — stopping a
 * single client from hammering the Gemini quota — without adding a Redis
 * dependency. A multi-instance burst can exceed the nominal limit.
 */

const windows = new Map<string, number[]>();

const MAX_TRACKED_KEYS = 5000;

export function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const cutoff = now - windowMs;

  // Opportunistic cleanup so a long-lived instance doesn't grow unbounded.
  if (windows.size > MAX_TRACKED_KEYS) {
    for (const [k, stamps] of windows) {
      if (stamps.every((t) => t < cutoff)) windows.delete(k);
    }
  }

  const stamps = (windows.get(key) ?? []).filter((t) => t >= cutoff);
  if (stamps.length >= maxRequests) {
    windows.set(key, stamps);
    return false;
  }
  stamps.push(now);
  windows.set(key, stamps);
  return true;
}
