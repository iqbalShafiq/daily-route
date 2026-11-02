import { describe, expect, it } from "vitest";

import {
  buildStreamRules,
  createStubStream,
  createXStream,
  superviseStream,
  type XStream,
} from "./stream.js";
import { xPostOf, type XPost, type XTweetPayload } from "./x.js";

const users = new Map([["1", { id: "1", username: "PT_Transjakarta", name: "Transjakarta" }]]);

function post(id: string): XPost {
  return {
    id,
    text: `post ${id}`,
    createdAt: "2026-10-24T10:00:00.000Z",
    authorId: "1",
    authorHandle: "PT_Transjakarta",
    url: `https://x.com/PT_Transjakarta/status/${id}`,
  };
}

describe("buildStreamRules", () => {
  it("follows each operator account and drops retweets", () => {
    const rules = buildStreamRules([
      { systemId: "transjakarta", handle: "PT_Transjakarta" },
      { systemId: "krl-jabodetabek", handle: "CommuterLine" },
    ]);
    expect(rules).toHaveLength(2);
    expect(rules[0]).toEqual({
      value: "from:PT_Transjakarta -is:retweet",
      tag: "transjakarta",
    });
    expect(rules[1]?.tag).toBe("krl-jabodetabek");
  });
});

describe("xPostOf", () => {
  it("keeps the long text and builds the status url", () => {
    const tweet: XTweetPayload = {
      id: "99",
      text: "short…",
      note_tweet: { text: "the long text" },
      author_id: "1",
      created_at: "2026-10-24T10:00:00.000Z",
    };
    const mapped = xPostOf(tweet, users);
    expect(mapped.text).toBe("the long text");
    expect(mapped.url).toBe("https://x.com/PT_Transjakarta/status/99");
  });
});

describe("createStubStream", () => {
  it("replays the recorded posts in order", async () => {
    const stream = createStubStream([{ post: post("a") }, { post: post("b") }]);
    const seen: string[] = [];
    await stream.open({ onPost: (entry) => void seen.push(entry.id) }, new AbortController().signal);
    expect(seen).toEqual(["a", "b"]);
    expect(stream.delivered).toBe(2);
  });

  it("stops when the signal aborts", async () => {
    const stream = createStubStream([
      { post: post("a") },
      { post: post("b"), delayMs: 50 },
      { post: post("c") },
    ]);
    const controller = new AbortController();
    const seen: string[] = [];
    await stream.open(
      {
        onPost: (entry) => {
          seen.push(entry.id);
          if (seen.length === 2) controller.abort();
        },
      },
      controller.signal,
    );
    expect(seen).toEqual(["a", "b"]);
  });
});

describe("createXStream", () => {
  it("replaces the rules and reads the newline-delimited stream", async () => {
    const calls: string[] = [];
    const lines = [
      JSON.stringify({
        data: {
          id: "10",
          text: "hello",
          author_id: "1",
          created_at: "2026-10-24T10:00:00Z",
          attachments: { media_keys: ["3_1"] },
        },
        includes: {
          media: [
            {
              media_key: "3_1",
              type: "photo",
              url: "https://pbs.twimg.com/media/announcement.jpg",
            },
          ],
        },
      }),
      "",
      JSON.stringify({
        data: { id: "11", text: "reply", author_id: "1", created_at: "2026-10-24T10:01:00Z" },
        includes: { users: [{ id: "1", username: "PT_Transjakarta", name: "Transjakarta" }] },
      }),
    ].join("\n");

    const fetchImpl = (async (input: string | URL | Request) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/stream/rules") && !url.includes("?")) {
        return new Response(JSON.stringify({ data: [] }), { status: 200 });
      }
      return new Response(lines, { status: 200 });
    }) as unknown as typeof fetch;

    const stream = createXStream({
      bearerToken: "test",
      baseUrl: "https://api.test",
      rules: buildStreamRules([{ systemId: "transjakarta", handle: "PT_Transjakarta" }]),
      fetchImpl,
    });
    const seen: string[] = [];
    const media: unknown[] = [];
    const controller = new AbortController();
    await stream.open(
      {
        onPost: (entry) => {
          seen.push(entry.id);
          if (entry.media) media.push(entry.media);
          if (seen.length === 2) controller.abort();
        },
      },
      controller.signal,
    );
    expect(seen).toEqual(["10", "11"]);
    expect(media).toEqual([
      [{ url: "https://pbs.twimg.com/media/announcement.jpg", type: "photo" }],
    ]);
    expect(calls.some((call) => call.includes("/2/tweets/search/stream/rules"))).toBe(true);
    const streamCall = calls.find((call) => call.includes("/2/tweets/search/stream?"));
    expect(streamCall).toContain("expansions=attachments.media_keys");
    expect(streamCall).not.toContain("expansions=author_id");
    expect(streamCall).toContain("note_tweet");
    expect(streamCall).not.toContain("note_post");
  });
});

describe("superviseStream", () => {
  it("opens the same stream again with a growing backoff", async () => {
    let opens = 0;
    const fake: XStream = {
      async open(handlers) {
        opens += 1;
        await handlers.onPost(post(String(opens)), { systemId: "transjakarta" });
      },
      close() {
        // The supervisor owns the lifetime.
      },
    };
    const controller = new AbortController();
    const seen: string[] = [];
    const sleeps: number[] = [];
    await superviseStream(
      fake,
      {
        onPost: (entry) => {
          seen.push(entry.id);
          if (seen.length === 3) controller.abort();
        },
      },
      {
        signal: controller.signal,
        sleep: async (ms) => {
          sleeps.push(ms);
        },
      },
    );
    expect(opens).toBe(3);
    expect(sleeps).toEqual([1_000, 2_000]);
  });
});
