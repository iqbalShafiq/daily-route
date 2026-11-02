import { normalizeText, tokenize, type Disruption, type Line, type Station, type TransitNetwork } from "@daily-route/transit";

import type { NoticeCandidate } from "./classify.js";
import { corridorCandidates } from "./screen.js";

/**
 * Narrowing the open board for one announcement.
 *
 * A monitor poll can see hundreds of open notices over time. Sending all of
 * them to the model is both expensive and noisy. This selector uses the
 * facts we already have — the line codes in the text, the stop names, and
 * the title vocabulary — to offer only the notices that could plausibly be
 * the same event or a closure of an earlier one. The model still decides;
 * it just decides over a short, relevant list.
 */

const MAX_CANDIDATES = 8;

const RESTORATION_WORDS = [
  "normal",
  "kembali",
  "beroperasi kembali",
  "berjalan normal",
  "dibuka kembali",
  "sudah dibuka",
  "tidak ada pengalihan",
  "kembali melayani",
];

/** The candidate notices for one post, best first. */
export function noticeCandidatesForPost(input: {
  text: string;
  systemHint: string | null;
  disruptions: readonly Disruption[];
  network: TransitNetwork;
  now?: Date;
}): NoticeCandidate[] {
  const text = normalizeText(input.text);
  const tokens = new Set(tokenize(input.text).filter((token) => token.length >= 4));
  const mentionedLines = new Set(
    corridorCandidates(input.text, input.network.lines, 24).map((line) => line.id),
  );
  const stationById = new Map(input.network.stations.map((station) => [station.id, station]));
  const lineById = new Map(input.network.lines.map((line) => [line.id, line]));
  const now = input.now ?? new Date();
  const restoration = RESTORATION_WORDS.some((word) => text.includes(normalizeText(word)));

  const scored: { disruption: Disruption; score: number; stationNames: string[]; lineCodes: string[] }[] = [];

  for (const disruption of input.disruptions) {
    if (disruption.status !== "active") continue;
    if (disruption.endsAt && Date.parse(disruption.endsAt) <= now.getTime()) continue;

    const stationIds = new Set(
      [disruption.stationId, ...disruption.affectedStationIds].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );
    const stations = [...stationIds]
      .map((id) => stationById.get(id))
      .filter((station): station is Station => station !== undefined);
    const stationNames = stations.map((station) => station.name);
    const lineIds = new Set(
      [disruption.lineId, ...disruption.affectedLineIds].filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    );
    const lines = [...lineIds]
      .map((id) => lineById.get(id))
      .filter((line): line is Line => line !== undefined);
    const lineCodes = lines.map((line) => line.code);

    let score = 0;
    let lineMatch = false;
    for (const line of lines) {
      if (mentionedLines.has(line.id)) {
        score += 4;
        lineMatch = true;
      }
    }
    let stationMatch = false;
    for (const station of stations) {
      if (containsName(text, station.name)) {
        score += 5;
        stationMatch = true;
      }
    }

    // Title vocabulary catches notices that name no line or stop at all,
    // such as an event-wide service change.
    let shared = 0;
    for (const token of tokenize(disruption.title)) {
      if (token.length < 4) continue;
      if (tokens.has(token)) shared += 1;
    }
    score += Math.min(shared, 4);

    // A restoration post is only useful against a notice that is still
    // open; give the most recent ones a fair chance even without a name.
    const ageHours = (now.getTime() - Date.parse(disruption.publishedAt)) / 3_600_000;
    if (restoration && !lineMatch && !stationMatch && ageHours <= 48) score += 1;

    if (score > 0) {
      scored.push({ disruption, score, stationNames, lineCodes });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Date.parse(b.disruption.publishedAt) - Date.parse(a.disruption.publishedAt);
  });

  const chosen = scored.slice(0, MAX_CANDIDATES);
  if (chosen.length === 0 && restoration) {
    const fallback = input.disruptions
      .filter((disruption) => disruption.status === "active")
      .filter((disruption) => !disruption.endsAt || Date.parse(disruption.endsAt) > now.getTime())
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
      .slice(0, 3);
    for (const disruption of fallback) {
      chosen.push({
        disruption,
        score: 1,
        stationNames: stationNamesOf(disruption, stationById),
        lineCodes: lineCodesOf(disruption, lineById),
      });
    }
  }

  return chosen.map(({ disruption, stationNames, lineCodes }) => ({
    id: disruption.id,
    title: disruption.title,
    eventKey: disruption.eventKey ?? null,
    systemId: disruption.systemId,
    lineCodes,
    stationNames,
    publishedAt: disruption.publishedAt,
    endsAt: disruption.endsAt ?? null,
    kind: disruption.kind,
    severity: disruption.severity,
  }));
}

/** One candidate, for a notice that the follow-up sweep is re-checking. */
export function candidateForNotice(
  disruption: Disruption,
  network: TransitNetwork,
): NoticeCandidate {
  const stationById = new Map(network.stations.map((station) => [station.id, station]));
  const lineById = new Map(network.lines.map((line) => [line.id, line]));
  return {
    id: disruption.id,
    title: disruption.title,
    eventKey: disruption.eventKey ?? null,
    systemId: disruption.systemId,
    lineCodes: lineCodesOf(disruption, lineById),
    stationNames: stationNamesOf(disruption, stationById),
    publishedAt: disruption.publishedAt,
    endsAt: disruption.endsAt ?? null,
    kind: disruption.kind,
    severity: disruption.severity,
  };
}

function stationNamesOf(
  disruption: Disruption,
  stationById: ReadonlyMap<string, Station>,
): string[] {
  const ids = new Set(
    [disruption.stationId, ...disruption.affectedStationIds].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
  );
  return [...ids]
    .map((id) => stationById.get(id)?.name)
    .filter((name): name is string => typeof name === "string");
}

function lineCodesOf(disruption: Disruption, lineById: ReadonlyMap<string, Line>): string[] {
  const ids = new Set(
    [disruption.lineId, ...disruption.affectedLineIds].filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    ),
  );
  return [...ids]
    .map((id) => lineById.get(id)?.code)
    .filter((code): code is string => typeof code === "string");
}

function containsName(text: string, name: string): boolean {
  const normalized = normalizeText(name);
  if (normalized.length < 4) return false;
  if (text.includes(normalized)) return true;
  // A stop name with a generic prefix ("Halte Pasar Rumput") is still the
  // same place as "Pasar Rumput"; the identity tokens are what matter.
  const tokens = tokenize(name).filter((token) => token.length >= 4);
  if (tokens.length === 0) return false;
  return tokens.every((token) => text.includes(token));
}
