import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

/**
 * A cache for the raw Overpass responses.
 *
 * The Overpass mirrors are slow and often at capacity, so the raw answers
 * are kept on disk. Re-running the merge then costs seconds instead of
 * minutes, and the exact upstream data stays reviewable.
 */

export type CacheOptions = {
  directory: string;
  /** Ignore the cache and fetch again. */
  refresh: boolean;
  /** How old a cached entry may be, in milliseconds. */
  maxAgeMs?: number;
};

export async function readCache<T>(
  name: string,
  options: CacheOptions,
): Promise<T | null> {
  if (options.refresh) return null;
  const path = cachePath(options.directory, name);

  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as { savedAt: number; data: T };
    const maxAge = options.maxAgeMs ?? Number.POSITIVE_INFINITY;
    if (Date.now() - parsed.savedAt > maxAge) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export async function writeCache<T>(
  name: string,
  data: T,
  options: CacheOptions,
): Promise<void> {
  const path = cachePath(options.directory, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify({ savedAt: Date.now(), data })}\n`, "utf8");
}

function cachePath(directory: string, name: string): string {
  return `${directory}/${name}.json`;
}
