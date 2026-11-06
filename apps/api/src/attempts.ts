/**
 * A sliding window of failed attempts, held in this process.
 *
 * The account endpoints need to slow a script that guesses passwords down,
 * and the cheapest way to do that is to remember the failures here. The
 * limiter is per process on purpose: a shared store would be one more
 * service that can be down, and the guard would fail open exactly when it
 * is needed. A restart forgets the window, which is an acceptable price.
 */
export type AttemptLimiter = {
  /** Whether the key already has too many failures inside the window. */
  blocked(key: string): boolean;
  /** Record one failed attempt for the key. */
  fail(key: string): void;
  /** Forget the key's failures after a successful attempt. */
  succeed(key: string): void;
};

/**
 * How many keys are remembered before the idle ones are dropped.
 *
 * Every key carries an address the caller wrote, so without a ceiling a
 * spray of addresses would grow the map for as long as the process lives.
 */
const MAX_KEYS = 5_000;

export function createAttemptLimiter(limit: number, windowMs: number): AttemptLimiter {
  // The failures of one key are the instants they happened at, so the
  // window slides instead of resetting on a fixed boundary.
  const failures = new Map<string, number[]>();

  /** The failures of a key that are still inside the window. */
  const recent = (key: string, now: number): number[] => {
    const entries = failures.get(key);
    if (!entries) return [];
    const cutoff = now - windowMs;
    const kept = entries.filter((at) => at > cutoff);
    if (kept.length === 0) {
      failures.delete(key);
    } else {
      failures.set(key, kept);
    }
    return kept;
  };

  const sweep = (now: number): void => {
    for (const key of failures.keys()) {
      recent(key, now);
    }
  };

  return {
    blocked(key) {
      return recent(key, Date.now()).length >= limit;
    },
    fail(key) {
      const now = Date.now();
      if (failures.size >= MAX_KEYS) {
        sweep(now);
        // A map that is still full is full of keys that failed inside the
        // window; the oldest one loses its place so the map stays bounded.
        if (failures.size >= MAX_KEYS) {
          const oldest = failures.keys().next();
          if (!oldest.done) {
            failures.delete(oldest.value);
          }
        }
      }
      const entries = recent(key, now);
      entries.push(now);
      failures.set(key, entries);
    },
    succeed(key) {
      failures.delete(key);
    },
  };
}
