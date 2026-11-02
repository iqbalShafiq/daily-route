import { createDb } from "@daily-route/db";
import { parseEnv } from "@daily-route/env";

import { createNewsSearch } from "../news.js";
import { createResearchReader, researchNotice } from "../research.js";
import { createQueryPlanner } from "../verify.js";
import { modelConfigFromEnv } from "../model.js";

type Row = { title: string; body: string; url: string | null; line_codes: unknown; published_at: Date };

async function main(): Promise<void> {
  const env = parseEnv();
  const db = createDb(env.DATABASE_URL);
  const id = process.argv[process.argv.indexOf("--id") + 1];
  const rows = await db.execute<Row>(`select title, body, url, line_codes, published_at from disruptions where id = '${id}'`);
  const row = rows[0];
  if (!row) throw new Error("not found");
  const search = createNewsSearch(env.TAVILY_API_KEY);
  if (!search) throw new Error("no tavily");
  const config = modelConfigFromEnv(env);
  const result = await researchNotice(
    {
      title: row.title,
      body: row.body,
      lineCodes: Array.isArray(row.line_codes) ? (row.line_codes as string[]) : [],
      stationNames: [],
      publishedAt: new Date(row.published_at),
      sourceUrls: row.url ? [row.url] : [],
    },
    { search, planner: createQueryPlanner(config, env), reader: createResearchReader(config, env) },
  );
  console.log(JSON.stringify(result, null, 2));
}

await main();
