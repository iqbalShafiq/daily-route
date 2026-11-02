import type { XPost, XSearchPage } from "./x.js";

/**
 * Catch up on the Posts the stream missed while it was reconnecting.
 *
 * This is deliberately narrower than a timeline scan:
 *
 * - only original Posts, never replies;
 * - only newer than the last Post or Reply that was stored;
 * - never older than eight hours, even when the stream has been down longer.
 *
 * The worker calls it once per connection, not on a timer.
 */

export type RecoveryAccount = {
  systemId: string;
  handle: string;
};

export type RecoveryBaseline = {
  id: string;
  publishedAt: Date;
};

export type RecoveryResult = {
  /** Posts stored by the catch-up. */
  recovered: number;
  /** Accounts with no stored Post, so there was nothing to anchor a since_id. */
  skipped: number;
  /** Accounts where the baseline was older than the eight-hour window. */
  capped: number;
  errors: string[];
};

export const RECOVERY_WINDOW_MS = 8 * 3_600_000;

export async function recoverMissedPosts(deps: {
  accounts: readonly RecoveryAccount[];
  /** The newest stored Post or Reply for a handle, or null when none exists. */
  baseline: (handle: string) => Promise<RecoveryBaseline | null>;
  /** Recent search, already constrained to original Posts by the caller. */
  search: (
    handle: string,
    options: { sinceId?: string; startTime?: Date },
  ) => Promise<XSearchPage>;
  ingest: (
    post: XPost & { systemId: string; accountId: string | null },
  ) => Promise<unknown>;
  /** Injectable for tests. */
  now?: Date;
}): Promise<RecoveryResult> {
  const result: RecoveryResult = { recovered: 0, skipped: 0, capped: 0, errors: [] };
  const now = deps.now ?? new Date();
  const windowStart = new Date(now.getTime() - RECOVERY_WINDOW_MS);

  for (const account of deps.accounts) {
    let last: RecoveryBaseline | null;
    try {
      last = await deps.baseline(account.handle);
    } catch (error) {
      result.errors.push(
        `@${account.handle}: could not read the last stored Post (${message(error)})`,
      );
      continue;
    }
    if (!last) {
      result.skipped += 1;
      continue;
    }

    // A stored reply is a valid baseline: it is the last item the worker
    // successfully read, even though this catch-up itself only returns Posts.
    const fromWindow = last.publishedAt.getTime() < windowStart.getTime();
    if (fromWindow) result.capped += 1;

    let page: XSearchPage;
    try {
      page = await deps.search(
        account.handle,
        fromWindow ? { startTime: windowStart } : { sinceId: last.id },
      );
    } catch (error) {
      result.errors.push(`@${account.handle}: catch-up failed (${message(error)})`);
      continue;
    }

    for (const post of page.posts) {
      if (post.id === last.id) continue;
      if (post.postType === "reply") continue;
      if (new Date(post.createdAt).getTime() <= last.publishedAt.getTime()) continue;
      if (fromWindow && new Date(post.createdAt).getTime() < windowStart.getTime()) continue;
      try {
        await deps.ingest({
          ...post,
          systemId: account.systemId,
          accountId: post.authorId || null,
        });
        result.recovered += 1;
      } catch (error) {
        result.errors.push(`@${account.handle}: ${post.id} not stored (${message(error)})`);
      }
    }
  }

  return result;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
