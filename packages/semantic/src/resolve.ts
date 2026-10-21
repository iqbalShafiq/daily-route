import { and, desc, sql } from "drizzle-orm";

import type { Database } from "@daily-route/db";
import { stationEmbeddings, stations, systems } from "@daily-route/db";
import { buildSearchDocument, canonicalKey, trigramDice } from "@daily-route/transit";

import type { EmbeddingProvider } from "./encoder.js";

export type PlaceCandidate = {
  stationId: string;
  name: string;
  systemId: string;
  systemName: string;
  mode: string;
  code: string | null;
  latitude: number;
  longitude: number;
  isInterchange: boolean;
  /** How many lines serve the station. */
  lineCount: number;
  /** The road the station stands on, when it is known. */
  street: string | null;
  aliases: string[];
  /** The blended score in `[0, 1]`. */
  score: number;
  /** The individual signals, kept so a caller can explain the ranking. */
  signals: {
    vector: number;
    lexical: number;
    exact: number;
  };
  /**
   * The parts of the name that matched the query.
   *
   * They are character ranges in the name, not markup, so the client can
   * mark them itself. A candidate that only matched by meaning has no
   * ranges: the interface must not claim a match it cannot point at.
   */
  matchedRanges: { start: number; end: number }[];
};

export type ResolveOptions = {
  limit?: number;
  /** Restrict to one system, e.g. "krl-jabodetabek". */
  systemId?: string;
  /** Weight of the embedding similarity in the blend. */
  vectorWeight?: number;
};

/** How many candidates each retrieval channel contributes. */
const CANDIDATES_PER_CHANNEL = 120;

/**
 * The score a candidate must reach to count as a confident match.
 *
 * Below it, the caller should ask the rider for a more specific name
 * instead of planning a route to the wrong station.
 */
export const PLACE_CONFIDENCE_THRESHOLD = 0.3;

/**
 * Resolves free-form place text to transit stations.
 *
 * Three independent signals are blended instead of relying on one:
 *
 * - the **vector** signal is cosine similarity of the query embedding against
 *   the stored station embeddings, which catches paraphrases and typos;
 * - the **lexical** signal is trigram similarity, which is exact about
 *   shared characters;
 * - the **exact** signal fires when the query matches a station name or one
 *   of its aliases outright.
 *
 * Blending matters because each signal fails differently: embeddings blur
 * short names, trigrams blur reordered words, and exact matching cannot see
 * a paraphrase at all.
 *
 * The two machine channels run as two database queries — the lexical one
 * ordered by trigram similarity, the vector one ordered by cosine distance —
 * and their results are merged before the final score is computed. One
 * channel alone would hide stations the other channel ranks highly.
 */
export class PlaceResolver {
  readonly #db: Database;
  readonly #provider: EmbeddingProvider;

  constructor(db: Database, provider: EmbeddingProvider) {
    this.#db = db;
    this.#provider = provider;
  }

  async resolve(text: string, options: ResolveOptions = {}): Promise<PlaceCandidate[]> {
    const query = text.trim();
    if (query.length === 0) return [];

    const limit = options.limit ?? 8;
    const vectorWeight = options.vectorWeight ?? 0.55;

    const [embedding] = await this.#provider.embed([query]);
    const vectorLiteral = embedding ? toVectorLiteral(embedding) : null;

    const systemFilter = options.systemId
      ? sql`${stations.systemId} = ${options.systemId}`
      : sql`TRUE`;

    const aliasPattern = `%${query}%`;

    const lexicalRows = await this.#db
      .select({
        id: stations.id,
        name: stations.name,
        systemId: stations.systemId,
        systemName: systems.name,
        mode: systems.mode,
        code: stations.code,
        latitude: stations.latitude,
        longitude: stations.longitude,
        isInterchange: stations.isInterchange,
        lineCount: stations.lineCount,
        street: sql<string | null>`${stations.metadata} ->> 'street'`,
        aliases: stations.aliases,
        lexical: sql<number>`GREATEST(
          similarity(${stations.searchText}, ${query}),
          similarity(${stations.name}, ${query})
        )`,
      })
      .from(stations)
      .innerJoin(systems, sql`${systems.id} = ${stations.systemId}`)
      .where(
        and(
          systemFilter,
          // The parentheses matter: without them the OR escapes the AND and
          // the system filter no longer applies.
          //
          // The aliases are searched as well: a rider asks for the name of
          // the place they know, and the report often knows that place
          // under another name ("Bundaran HI / Grand Indonesia").
          sql`(${stations.searchText} % ${query}
            OR similarity(${stations.name}, ${query}) > 0.08
            OR EXISTS (
              SELECT 1 FROM jsonb_array_elements_text(${stations.aliases}) AS alias
              WHERE alias ILIKE ${aliasPattern} OR alias % ${query}
            ))`,
        ),
      )
      .orderBy(desc(sql`GREATEST(similarity(${stations.searchText}, ${query}), similarity(${stations.name}, ${query}))`))
      .limit(CANDIDATES_PER_CHANNEL);

    const vectorRows = vectorLiteral
      ? await this.#db
          .select({
            id: stations.id,
            name: stations.name,
            systemId: stations.systemId,
            systemName: systems.name,
            mode: systems.mode,
            code: stations.code,
            latitude: stations.latitude,
            longitude: stations.longitude,
            isInterchange: stations.isInterchange,
            lineCount: stations.lineCount,
            street: sql<string | null>`${stations.metadata} ->> 'street'`,
            aliases: stations.aliases,
            vector: sql<number>`1 - (${stationEmbeddings.embedding} <=> ${vectorLiteral}::vector)`,
          })
          .from(stations)
          .innerJoin(systems, sql`${systems.id} = ${stations.systemId}`)
          .innerJoin(
            stationEmbeddings,
            sql`${stationEmbeddings.stationId} = ${stations.id} AND ${stationEmbeddings.model} = ${this.#provider.model}`,
          )
          .where(systemFilter)
          .orderBy(sql`${stationEmbeddings.embedding} <=> ${vectorLiteral}::vector`)
          .limit(CANDIDATES_PER_CHANNEL)
      : [];

    const lexicalById = new Map(lexicalRows.map((row) => [row.id, row]));
    const vectorById = new Map(vectorRows.map((row) => [row.id, row]));

    const candidates: PlaceCandidate[] = [];
    for (const id of new Set([...lexicalById.keys(), ...vectorById.keys()])) {
      const lexicalRow = lexicalById.get(id);
      const vectorRow = vectorById.get(id);
      const row = lexicalRow ?? vectorRow;
      if (!row) continue;

      const aliases = (row.aliases as string[]) ?? [];
      const aliasScore = aliases.reduce(
        (best, alias) => Math.max(best, trigramDice(query, alias)),
        0,
      );

      const lexical = Math.max(
        Number(lexicalRow?.lexical ?? 0),
        trigramDice(query, row.name),
        aliasScore,
        lexicalTier(query, row.name, aliases),
      );
      const vector = clamp01(Number(vectorRow?.vector ?? 0));
      const exact = exactMatch(query, row.name, aliases) ? 1 : 0;

      const score = clamp01(vectorWeight * vector + (1 - vectorWeight) * lexical + 0.25 * exact);

      candidates.push({
        stationId: row.id,
        name: row.name,
        systemId: row.systemId,
        systemName: row.systemName,
        mode: row.mode,
        code: row.code,
        latitude: row.latitude,
        longitude: row.longitude,
        isInterchange: row.isInterchange,
        lineCount: row.lineCount,
        street: row.street ?? null,
        aliases,
        score,
        signals: { vector, lexical, exact },
        matchedRanges: matchedRangesOf(query, row.name),
      });
    }

    return candidates
      .filter((candidate) => candidate.score > 0.1)
      .sort(
        (a, b) =>
          // The score decides. Between two places that answer equally well,
          // the one a rider is more likely to mean comes first: a place
          // that changes lines, and then the shorter name.
          b.score - a.score ||
          Number(b.isInterchange) - Number(a.isInterchange) ||
          // Between two places that answer equally well, the one with
          // more lines through it is the one the rider meant.
          b.lineCount - a.lineCount ||
          a.name.localeCompare(b.name, "id"),
      )
      .slice(0, limit);
  }

  /** The searchable document stored next to a station for semantic lookups. */
  static documentFor(station: {
    name: string;
    code: string | null;
    aliases: readonly string[];
    area: string | null;
    description: string;
  }): string {
    return buildSearchDocument({
      name: station.name,
      code: station.code,
      aliases: station.aliases,
      area: station.area,
      description: station.description,
    });
  }
}

function exactMatch(query: string, name: string, aliases: readonly string[]): boolean {
  const key = canonicalKey(query);
  if (key.length === 0) return false;
  if (canonicalKey(name) === key) return true;
  return aliases.some((alias) => canonicalKey(alias) === key);
}

/**
 * The parts of the name that the query matched.
 *
 * Only the words of the query are looked for, and only in the name: a
 * candidate that matched through an alias is marked by its name alone.
 */
function matchedRangesOf(query: string, name: string): { start: number; end: number }[] {
  const words = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 1);
  if (words.length === 0) return [];

  const haystack = name.toLowerCase();
  const ranges: { start: number; end: number }[] = [];

  for (const word of words) {
    let cursor = 0;
    while (cursor < name.length) {
      const found = haystack.indexOf(word, cursor);
      if (found === -1) break;
      ranges.push({ start: found, end: found + word.length });
      cursor = found + word.length;
    }
  }

  return ranges.sort((a, b) => a.start - b.start);
}

/**
 * How strongly a name answers to the query.
 *
 * Trigrams measure resemblance, but a rider who types "bundaran" wants the
 * stations whose name *starts* with that, not the ones that merely share
 * letters with it. The three tiers say so:
 *
 * - the name is the query, or the query is the name: certain;
 * - the name starts with the query: almost certain;
 * - the query is a whole word of the name: likely.
 */
function lexicalTier(query: string, name: string, aliases: readonly string[]): number {
  const key = canonicalKey(query);
  if (key.length === 0) return 0;

  const candidates = [name, ...aliases].map((candidate) => canonicalKey(candidate));
  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    if (candidate === key) return 1;
  }

  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    if (candidate.startsWith(key)) return 0.85;
  }

  for (const candidate of candidates) {
    if (candidate.length === 0) continue;
    if (candidate.includes(` ${key} `) || candidate.startsWith(`${key} `)) return 0.6;
  }

  return 0;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** Format a vector as the literal Postgres expects for a `vector` column. */
export function toVectorLiteral(vector: readonly number[]): string {
  return `[${vector.map((value) => value.toFixed(6)).join(",")}]`;
}
