/**
 * Collect a small, fixed corpus for the notice evaluation.
 *
 * The point is to fetch once and then test against the same text for as
 * long as it takes to be satisfied with the result. The file this writes is
 * committed, so a later run does not need the network at all.
 *
 * Run with `pnpm eval:fetch`. It writes `research/eval/corpus.json`.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { parseEnv } from "@daily-route/env";

import { createNewsSearch, TRANSIT_NEWS_DOMAINS } from "../news.js";
import { createXClient } from "../x.js";

type FetchedPost = {
  source: "x" | "news";
  author: string;
  text: string;
  url: string;
  publishedAt: string;
};

/**
 * The questions that reach the cases this corpus is missing.
 *
 * The monitor watches the operators' own accounts, which mostly post about
 * Transjakarta. The rail operators need to be asked for.
 */
const X_QUERIES = [
  '(KRL OR "MRT Jakarta" OR "LRT Jakarta" OR "LRT Jabodebek") (gangguan OR pengalihan OR penutupan OR perbaikan OR dibatalkan) -is:retweet lang:id',
  '(KRL OR MRT OR LRT) (stasiun OR halte) (tutup OR dialihkan OR tidak berhenti) -is:retweet lang:id',
];

const NEWS_QUERIES = [
  "gangguan perbaikan KRL Jabodetabek stasiun ditutup",
  "MRT Jakarta LRT Jakarta gangguan layanan pengalihan",
];

async function main(): Promise<void> {
  const env = parseEnv();
  const posts: FetchedPost[] = [];

  if (env.X_BEARER_TOKEN) {
    const x = createXClient({ bearerToken: env.X_BEARER_TOKEN, baseUrl: env.X_API_BASE_URL });
    for (const query of X_QUERIES) {
      try {
        const page = await x.searchPosts(query, { maxPages: 1 });
        for (const post of page.posts) {
          posts.push({
            source: "x",
            author: post.authorHandle,
            text: post.text,
            url: post.url,
            publishedAt: post.createdAt,
          });
        }
        console.log(`· X "${query.slice(0, 40)}…": ${page.posts.length} posts`);
      } catch (error) {
        console.warn(`  X gagal: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const news = createNewsSearch(env.TAVILY_API_KEY);
  if (news) {
    for (const query of NEWS_QUERIES) {
      try {
        const found = await news({
          query,
          maxResults: 10,
          timeRange: "week",
          topic: "news",
          includeDomains: TRANSIT_NEWS_DOMAINS,
        });
        for (const item of found) {
          posts.push({
            source: "news",
            author: item.source ?? "news",
            text: `${item.title}\n\n${item.content}`,
            url: item.url,
            publishedAt: item.publishedAt ?? new Date().toISOString(),
          });
        }
        console.log(`· Tavily "${query.slice(0, 40)}…": ${found.length} items`);
      } catch (error) {
        console.warn(`  Tavily gagal: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  const directory = resolve(import.meta.dirname, "../../../..", "research/eval");
  await mkdir(directory, { recursive: true });
  const output = resolve(directory, "corpus.json");
  await writeFile(
    output,
    `${JSON.stringify({ fetchedAt: new Date().toISOString(), posts }, null, 2)}\n`,
    "utf8",
  );
  console.log(`✓ ${output}: ${posts.length} items`);
}

main().catch((error: unknown) => {
  console.error("fetch gagal:", error);
  process.exitCode = 1;
});
