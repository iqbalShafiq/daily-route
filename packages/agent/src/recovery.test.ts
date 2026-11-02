import { describe, expect, it, vi } from "vitest";

import { recoverMissedPosts, RECOVERY_WINDOW_MS } from "./recovery.js";
import type { XPost, XSearchPage } from "./x.js";

const NOW = new Date("2026-10-29T05:00:00.000Z");

function post(id: string, createdAt: string, postType: "post" | "reply" = "post"): XPost {
  return {
    id,
    text: `post ${id}`,
    createdAt,
    authorId: "1",
    authorHandle: "CommuterLine",
    url: `https://x.com/CommuterLine/status/${id}`,
    postType,
  };
}

function page(posts: XPost[]): XSearchPage {
  return {
    posts,
    newestId: posts[0]?.id ?? null,
    oldestId: posts.at(-1)?.id ?? null,
    nextToken: null,
    pages: 1,
    complete: true,
    rateLimitResetAt: null,
    mode: "search",
  };
}

const account = { systemId: "krl-jabodetabek", handle: "CommuterLine" };

describe("recoverMissedPosts", () => {
  it("reads only Posts newer than the last stored Post or Reply", async () => {
    const search = vi.fn(async () =>
      page([
        post("101", "2026-10-29T04:50:00.000Z"),
        post("102", "2026-10-29T04:40:00.000Z", "reply"),
        post("99", "2026-10-29T03:30:00.000Z"),
      ]),
    );
    const ingest = vi.fn(
      async (_post: XPost & { systemId: string; accountId: string | null }) => undefined,
    );
    const result = await recoverMissedPosts({
      accounts: [account],
      now: NOW,
      baseline: async () => ({
        id: "100",
        publishedAt: new Date("2026-10-29T04:00:00.000Z"),
      }),
      search,
      ingest,
    });

    expect(search).toHaveBeenCalledWith("CommuterLine", { sinceId: "100" });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]?.[0]).toMatchObject({
      id: "101",
      systemId: "krl-jabodetabek",
    });
    expect(result).toMatchObject({ recovered: 1, skipped: 0, capped: 0 });
  });

  it("caps an old baseline at eight hours", async () => {
    const startTime = new Date(NOW.getTime() - RECOVERY_WINDOW_MS);
    const search = vi.fn(async () =>
      page([
        post("200", "2026-10-29T04:55:00.000Z"),
        post("190", "2026-10-28T20:55:00.000Z"),
      ]),
    );
    const ingest = vi.fn(
      async (_post: XPost & { systemId: string; accountId: string | null }) => undefined,
    );
    const result = await recoverMissedPosts({
      accounts: [account],
      now: NOW,
      baseline: async () => ({
        id: "180",
        publishedAt: new Date("2026-10-28T19:00:00.000Z"),
      }),
      search,
      ingest,
    });

    expect(search).toHaveBeenCalledWith("CommuterLine", { startTime });
    expect(ingest).toHaveBeenCalledTimes(1);
    expect(ingest.mock.calls[0]?.[0]).toMatchObject({ id: "200" });
    expect(result).toMatchObject({ recovered: 1, capped: 1 });
  });

  it("skips an account with no stored baseline", async () => {
    const search = vi.fn(async () => page([]));
    const result = await recoverMissedPosts({
      accounts: [account],
      now: NOW,
      baseline: async () => null,
      search,
      ingest: async () => undefined,
    });

    expect(search).not.toHaveBeenCalled();
    expect(result).toMatchObject({ recovered: 0, skipped: 1 });
  });

  it("reports a failed search without stopping the next account", async () => {
    const result = await recoverMissedPosts({
      accounts: [account],
      now: NOW,
      baseline: async () => ({
        id: "100",
        publishedAt: new Date("2026-10-29T04:00:00.000Z"),
      }),
      search: async () => {
        throw new Error("402 CreditsDepleted");
      },
      ingest: async () => undefined,
    });

    expect(result.recovered).toBe(0);
    expect(result.errors[0]).toContain("402 CreditsDepleted");
  });
});
