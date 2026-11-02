import { describe, expect, it, vi } from "vitest";

import { createXClient, OPERATOR_HANDLES, XApiError, xPostOf } from "./x.js";

/**
 * The X client.
 *
 * The request itself is the contract with the X API, so it is asserted
 * rather than assumed: the query, the authorisation and the shape of the
 * answer all matter.
 */

const RESPONSE = {
  data: [
    {
      id: "1900000000000000001",
      text: "Layanan koridor 1 dialihkan sementara.",
      created_at: "2026-10-20T09:00:00.000Z",
      author_id: "104556071",
      lang: "id",
      conversation_id: "1900000000000000001",
      attachments: { media_keys: ["3_1"] },
    },
  ],
  includes: {
    users: [{ id: "104556071", username: "PT_Transjakarta", name: "Transjakarta" }],
    media: [
      {
        media_key: "3_1",
        type: "photo",
        url: "https://pbs.twimg.com/media/announcement.jpg",
        alt_text: "Informasi layanan",
      },
    ],
  },
  meta: {
    newest_id: "1900000000000000001",
    oldest_id: "1900000000000000001",
    result_count: 1,
  },
};

describe("createXClient", () => {
  it("asks for the newest posts of one account with search", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createXClient({
      bearerToken: "token",
      baseUrl: "https://api.x.com",
    });

    const page = await client.searchAccount("PT_Transjakarta");

    expect(page.posts).toHaveLength(1);
    expect(page.posts[0]?.authorHandle).toBe("PT_Transjakarta");
    expect(page.posts[0]?.url).toContain("PT_Transjakarta/status/1900000000000000001");
    expect(page.posts[0]?.media).toEqual([
      {
        url: "https://pbs.twimg.com/media/announcement.jpg",
        type: "photo",
        altText: "Informasi layanan",
      },
    ]);
    expect(page.complete).toBe(true);
    expect(page.newestId).toBe("1900000000000000001");

    const request = fetchMock.mock.calls[0];
    const url = String(request?.[0] ?? "");
    expect(url).toContain("/2/tweets/search/recent");
    expect(url).toContain("from%3APT_Transjakarta");
    expect(url).toContain("-is%3Aretweet");
    expect(url).toContain("max_results=100");
    expect(url).not.toContain("-is%3Areply");
    expect(url).toContain("note_post");
    expect(url).not.toContain("note_tweet");

    const headers = (request?.[1]?.headers ?? {}) as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer token");

    vi.unstubAllGlobals();
  });

  it("bounds a recent search by time and page size", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });
    await client.searchPosts("Simpang Kuningan", {
      startTime: new Date("2026-10-25T02:30:00+07:00"),
      endTime: new Date("2026-10-25T09:15:00+07:00"),
      maxResults: 25,
    });
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("max_results=25");
    expect(url).toContain("start_time=2026-10-24T19%3A30%3A00.000Z");
    expect(url).toContain("end_time=2026-10-25T02%3A15%3A00.000Z");
    vi.unstubAllGlobals();
  });

  it("passes the last seen post id so nothing is read twice", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });
    await client.searchAccount("PT_Transjakarta", { sinceId: "1900000000000000000" });

    expect(String(fetchMock.mock.calls[0]?.[0] ?? "")).toContain(
      "since_id=1900000000000000000",
    );

    vi.unstubAllGlobals();
  });

  it("uses the user timeline when the stable account id is known", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });
    const page = await client.searchAccount("PT_Transjakarta", {
      accountId: "104556071",
      pageToken: "page-2",
    });

    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("/2/users/104556071/tweets");
    expect(url).toContain("pagination_token=page-2");
    expect(url).toContain("exclude=retweets");
    expect(url).toContain("note_tweet");
    expect(page.mode).toBe("timeline");
    expect(page.posts[0]?.conversationId).toBe("1900000000000000001");

    vi.unstubAllGlobals();
  });

  it("keeps the next token when the page budget is reached", async () => {
    const withNext = {
      ...RESPONSE,
      meta: { ...RESPONSE.meta, next_token: "next-page" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(withNext), { status: 200 })),
    );

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });
    const page = await client.searchAccount("PT_Transjakarta", { maxPages: 1 });

    expect(page.complete).toBe(false);
    expect(page.nextToken).toBe("next-page");

    vi.unstubAllGlobals();
  });

  it("resolves a stable user id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ data: { id: "104556071" } }), { status: 200 }),
      ),
    );

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });
    await expect(client.getAccountId("PT_Transjakarta")).resolves.toBe("104556071");

    vi.unstubAllGlobals();
  });

  it("names the rate limit when the API refuses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 429, headers: { "x-rate-limit-reset": "60" } })),
    );

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });

    await expect(client.searchAccount("PT_Transjakarta")).rejects.toThrow(XApiError);
    await expect(client.searchAccount("PT_Transjakarta")).rejects.toThrow(/rate limit/);

    vi.unstubAllGlobals();
  });

  it("reports a failed request with its status", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 500 })));

    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });

    await expect(client.searchAccount("PT_Transjakarta")).rejects.toThrow(/500/);

    vi.unstubAllGlobals();
  });

  it("can skip author profiles and use the handle from the account query", async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL, _init?: RequestInit) =>
        new Response(JSON.stringify(RESPONSE), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createXClient({ bearerToken: "token", baseUrl: "https://api.x.com" });
    const page = await client.searchPosts("from:CommuterLine -is:retweet -is:reply", {
      includeAuthors: false,
      authorHandle: "CommuterLine",
    });
    const url = String(fetchMock.mock.calls[0]?.[0] ?? "");
    expect(url).toContain("expansions=attachments.media_keys");
    expect(url).not.toContain("expansions=author_id");
    expect(url).not.toContain("user.fields");
    expect(url).toContain("media.fields=url%2Cpreview_image_url%2Calt_text%2Ctype");
    expect(page.posts[0]?.authorHandle).toBe("CommuterLine");
    expect(page.posts[0]?.url).toContain("CommuterLine/status/1900000000000000001");
    vi.unstubAllGlobals();
  });
});

describe("OPERATOR_HANDLES", () => {
  it("watches the official account of every operator", () => {
    expect(OPERATOR_HANDLES).toEqual({
      transjakarta: "PT_Transjakarta",
      "mrt-jakarta": "mrtjakarta",
      "lrt-jakarta": "lrtjkt",
      "lrt-jabodebek": "lrtjabodebek",
      "krl-jabodetabek": "CommuterLine",
    });
  });
});

describe("xPostOf", () => {
  const users = new Map([["42", { id: "42", username: "PT_Transjakarta", name: "Transjakarta" }]]);
  const base = {
    id: "1900000000000000002",
    text: "Hai Kak.",
    created_at: "2026-10-26T07:13:41.000Z",
    author_id: "42",
  };

  it("marks a reply and keeps the Post it answers", () => {
    const post = xPostOf(
      {
        ...base,
        referenced_tweets: [{ type: "replied_to", id: "1900000000000000001" }],
        in_reply_to_user_id: "77",
      },
      users,
    );
    expect(post.postType).toBe("reply");
    expect(post.inReplyToPostId).toBe("1900000000000000001");
    expect(post.inReplyToUserId).toBe("77");
  });

  it("marks an original Post", () => {
    const post = xPostOf(base, users);
    expect(post.postType).toBe("post");
    expect(post.inReplyToPostId).toBeUndefined();
  });
});

describe("xPostOf media", () => {
  it("maps photo and video previews to images", () => {
    const media = new Map([
      [
        "3_1",
        {
          media_key: "3_1",
          type: "photo",
          url: "https://pbs.twimg.com/media/one.jpg",
          alt_text: "Penutupan pintu",
        },
      ],
      ["3_2", { media_key: "3_2", type: "video", preview_image_url: "https://pbs.twimg.com/media/two.jpg" }],
      ["3_3", { media_key: "3_3", type: "photo" }],
    ]);
    const post = xPostOf(
      {
        id: "9",
        text: "",
        author_id: "42",
        attachments: { media_keys: ["3_1", "3_2", "3_3"] },
      },
      new Map([["42", { id: "42", username: "mrtjakarta", name: "MRT Jakarta" }]]),
      media,
    );
    expect(post.media).toEqual([
      { url: "https://pbs.twimg.com/media/one.jpg", type: "photo", altText: "Penutupan pintu" },
      { url: "https://pbs.twimg.com/media/two.jpg", type: "video" },
    ]);
  });
});
