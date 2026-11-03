import { spawn } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { parseEnv } from "@daily-route/env";

/**
 * The places snapshot.
 *
 * Overture Maps publishes a places theme every month under an open
 * licence. It is not an API: the extract is read from the public Parquet
 * files, trimmed to Jabodetabek, deduplicated, and kept in this
 * repository so a search is a local query, not a request to a geocoder
 * with a rate limit.
 *
 * `extract` rebuilds the snapshot from Overture. `load` copies the
 * committed snapshot into Postgres. Both need the DuckDB command line;
 * the extension that reads S3 and the one that writes Postgres are
 * installed on first use.
 */

const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SNAPSHOT = `${ROOT}data/places-jabodetabek.parquet`;
const METADATA = `${ROOT}data/places-jabodetabek.json`;
const STAC = "https://stac.overturemaps.org";

/** The box the network covers: Bogor, Depok, Tangerang, Bekasi, Jakarta. */
const JABODETABEK = {
  minLongitude: 106.4,
  maxLongitude: 107.2,
  minLatitude: -6.7,
  maxLatitude: -6.05,
} as const;

type StacLink = { rel?: string; href?: string };
type StacCatalog = { latest?: string };
type StacItem = { assets?: { aws?: { href?: string } } };

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "extract") {
    await extract();
    return;
  }
  if (command === "load") {
    await load();
    return;
  }
  throw new Error("Use `places extract` or `places load`.");
}

async function extract(): Promise<void> {
  const release = await latestRelease();
  console.log(`Overture places ${release}`);

  const files = await placeFiles(release);
  console.log(`${files.length} Parquet files`);

  const list = files.map((href) => `'${href}'`).join(", ");
  const temporary = `${SNAPSHOT}.tmp`;
  const sql = `
INSTALL httpfs;
LOAD httpfs;
COPY (
  WITH extract AS (
    SELECT
      id,
      names.primary AS name,
      COALESCE(taxonomy.primary, basic_category) AS category,
      addresses[1].freeform AS address,
      addresses[1].locality AS locality,
      confidence,
      bbox.ymin AS latitude,
      bbox.xmin AS longitude,
      ROW_NUMBER() OVER (
        PARTITION BY lower(trim(names.primary)), round(bbox.ymin, 3), round(bbox.xmin, 3)
        ORDER BY confidence DESC
      ) AS rn
    FROM read_parquet([${list}])
    WHERE bbox.xmin >= ${JABODETABEK.minLongitude}
      AND bbox.xmax <= ${JABODETABEK.maxLongitude}
      AND bbox.ymin >= ${JABODETABEK.minLatitude}
      AND bbox.ymax <= ${JABODETABEK.maxLatitude}
      AND names.primary IS NOT NULL
      AND length(trim(names.primary)) >= 2
      AND left(trim(names.primary), 1) NOT IN ('.', '-', '_')
      AND confidence >= 0.5
      AND (operating_status IS NULL OR operating_status = 'open')
  )
  SELECT id, name, category, address, locality, confidence, latitude, longitude
  FROM extract
  WHERE rn = 1
) TO '${temporary}' (FORMAT PARQUET, COMPRESSION ZSTD);
`;

  await duckdb(sql);
  const [summary] = await duckdbJson<{ count: number }>(
    `SELECT count(*)::BIGINT AS count FROM read_parquet('${temporary}');`,
  );
  const count = Number(summary?.count ?? 0);
  if (!count) throw new Error("The snapshot is empty.");
  await rename(temporary, SNAPSHOT);

  const metadata = {
    source: "Overture Maps Foundation",
    theme: "places",
    release,
    license: "CDLA Permissive 2.0, Apache 2.0 for the Foursquare records",
    attribution:
      "Places © Overture Maps Foundation. Foursquare records © Foursquare Labs, Inc. (Apache 2.0).",
    bbox: JABODETABEK,
    count,
    file: "data/places-jabodetabek.parquet",
    notice: "data/PLACES-NOTICE.txt",
    extractedAt: new Date().toISOString(),
  };
  await writeFile(METADATA, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");
  console.log(`${count} places written to ${SNAPSHOT}`);
}

async function load(): Promise<void> {
  const env = parseEnv();
  const metadata = JSON.parse(await readFile(METADATA, "utf8")) as { release?: string };
  const release = metadata.release ?? "unknown";
  const attach = connectionOf(env.DATABASE_URL);

  const sql = `
INSTALL postgres;
LOAD postgres;
ATTACH '${attach}' AS pg (TYPE postgres, READ_WRITE);
DELETE FROM pg.public.map_places;
INSERT INTO pg.public.map_places
  (id, name, category, address, locality, confidence, latitude, longitude, release, created_at)
SELECT id, name, category, address, locality, confidence, latitude, longitude, '${release}', now()
FROM read_parquet('${SNAPSHOT}');
SELECT count(*)::BIGINT AS count FROM pg.public.map_places;
`;

  const [summary] = await duckdbJson<{ count: number }>(sql);
  console.log(`${summary?.count ?? 0} places loaded into map_places (${release})`);
}

async function latestRelease(): Promise<string> {
  const catalog = await getJson<StacCatalog>(`${STAC}/catalog.json`);
  if (!catalog.latest) throw new Error("The Overture catalog has no latest release.");
  return catalog.latest;
}

async function placeFiles(release: string): Promise<string[]> {
  const collection = await getJson<{ links?: StacLink[] }>(
    `${STAC}/${release}/places/place/collection.json`,
  );
  const items = (collection.links ?? [])
    .filter(
      (link) =>
        (link.rel === "item" || link.rel === "child") && link.href?.endsWith(".json"),
    )
    .map((link) => link.href as string);
  if (items.length === 0) throw new Error("The Overture place collection has no items.");

  const files: string[] = [];
  for (const item of items) {
    const detail = await getJson<StacItem>(item);
    const href = detail.assets?.aws?.href;
    if (href) files.push(href);
  }
  if (files.length === 0) throw new Error("The Overture items have no AWS assets.");
  return files;
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "daily-route/0.1" },
  });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return (await response.json()) as T;
}

function connectionOf(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  const password = decodeURIComponent(url.password).replace(/'/g, "''");
  const user = decodeURIComponent(url.username).replace(/'/g, "''");
  const database = url.pathname.replace(/^\//, "");
  return [
    `host=${url.hostname}`,
    `port=${url.port || "5432"}`,
    `dbname=${database}`,
    `user=${user}`,
    `password=${password}`,
  ].join(" ");
}

async function duckdb(sql: string): Promise<string> {
  return run(["duckdb", "-no-agent", ":memory:"], sql);
}

async function duckdbJson<T>(sql: string): Promise<T[]> {
  const output = await run(["duckdb", "-json", "-no-agent", ":memory:"], sql);
  const parsed = JSON.parse(output) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function run(args: string[], sql: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(args[0] as string, args.slice(1), {
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("error", (error) => {
      reject(
        new Error(
          `DuckDB is not installed. Run \`brew install duckdb\` and retry. ${error.message}`,
        ),
      );
    });
    child.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`DuckDB failed: ${stderr.trim() || stdout.trim()}`));
    });
    child.stdin.end(sql);
  });
}

await main();
