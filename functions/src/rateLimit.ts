/**
 * Per-UID sliding-window rate limiter for Cloud Functions.
 *
 * Backed by Firestore at /internalRateLimits/{uid}. Each action stores a list
 * of recent invocation timestamps (ms). On each call, old entries are pruned
 * and if the list is at capacity, the call is rejected with a
 * `resource-exhausted` HttpsError. The read/prune/append cycle runs inside a
 * transaction so concurrent invocations from the same UID cannot bypass the cap.
 *
 * /internalRateLimits/* is server-only: Firestore rules default-deny covers it.
 */

import type { Firestore } from "firebase-admin/firestore";
import { HttpsError } from "firebase-functions/v2/https";

export interface RateLimitConfig {
  max: number;
  windowMs: number;
}

export const DEFAULT_ADMIN_ACTION_LIMIT: RateLimitConfig = {
  max: 10,
  windowMs: 60_000,
};

/**
 * Prune + count timestamps, used by the transaction and by unit tests.
 * Exported for testability.
 */
export function evaluateWindow(
  previous: unknown,
  now: number,
  windowMs: number,
  max: number
): { allowed: boolean; nextAttempts: number[] } {
  const cutoff = now - windowMs;
  const prev = Array.isArray(previous) ? (previous as unknown[]) : [];
  const recent = prev.filter(
    (t): t is number => typeof t === "number" && Number.isFinite(t) && t > cutoff
  );

  if (recent.length >= max) {
    return { allowed: false, nextAttempts: recent };
  }
  return { allowed: true, nextAttempts: [...recent, now] };
}

/**
 * Enforces the per-UID rate limit for a named action.
 * Throws HttpsError('resource-exhausted') when the cap is hit.
 */
export async function enforceRateLimit(
  db: Firestore,
  uid: string,
  action: string,
  config: RateLimitConfig = DEFAULT_ADMIN_ACTION_LIMIT
): Promise<void> {
  const ref = db.collection("internalRateLimits").doc(uid);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() ?? {} : {};
    const result = evaluateWindow(data[action], now, config.windowMs, config.max);

    if (!result.allowed) {
      throw new HttpsError(
        "resource-exhausted",
        `Rate limit exceeded for ${action}: max ${config.max} calls per ${Math.round(
          config.windowMs / 1000
        )}s`
      );
    }

    tx.set(ref, { [action]: result.nextAttempts }, { merge: true });
  });
}
