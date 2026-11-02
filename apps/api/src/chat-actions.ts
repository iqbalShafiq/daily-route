/**
 * Buttons the assistant can offer.
 *
 * They are built from a tool result, never from the model's prose, so a
 * station id or a notice id has to have come back from a tool.
 */

export type ChatAction = {
  key: string;
  label: string;
} & (
  | {
      type: "show_notice";
      disruptionId: string;
      latitude: number;
      longitude: number;
    }
  | { type: "show_route"; origin: string; destination: string }
  | {
      type: "show_stop";
      stationId: string;
      name: string;
      latitude: number;
      longitude: number;
    }
  | {
      type: "set_origin";
      stationId: string;
      name: string;
      latitude: number;
      longitude: number;
    }
  | {
      type: "set_destination";
      stationId: string;
      name: string;
      latitude: number;
      longitude: number;
    }
  | { type: "open_source"; url: string }
);

const MAX_ACTIONS = 6;

/** The buttons one tool result can offer. */
export function actionsFromTool(toolName: string, result: unknown): ChatAction[] {
  const row = asRecord(result);
  if (!row) return [];
  const actions: ChatAction[] = [];

  if (toolName === "plan_journey") {
    const origin = placeName(row.asal);
    const destination = placeName(row.tujuan);
    if (origin && destination) {
      actions.push({
        key: `route:${origin}:${destination}`,
        type: "show_route",
        label: "Show this route",
        origin,
        destination,
      });
    }
    pushNotices(actions, row.gangguan);
  } else if (toolName === "list_active_disruptions") {
    pushNotices(actions, row.gangguan);
  } else if (toolName === "get_station") {
    pushStation(actions, row, true);
  } else if (toolName === "resolve_place") {
    const ranked = (Array.isArray(row.candidates) ? row.candidates : [])
      .map(asRecord)
      .filter((item): item is Record<string, unknown> => item !== null)
      .filter((item) => (finite(item.score) ?? 0) >= 0.45)
      .slice(0, 3);
    const best = ranked[0];
    if (best) pushStation(actions, best, true);
    for (const extra of ranked.slice(1)) pushStation(actions, extra, false);
  }

  return dedupe(actions).slice(0, MAX_ACTIONS);
}

/** Parse a tool result that arrived as a JSON string. */
export function parseToolResult(result: unknown): unknown {
  if (typeof result !== "string") return result;
  try {
    return JSON.parse(result) as unknown;
  } catch {
    return null;
  }
}

function pushNotices(actions: ChatAction[], value: unknown): void {
  if (!Array.isArray(value)) return;
  let notices = 0;
  let sources = actions.filter((action) => action.type === "open_source").length;
  for (const item of value) {
    const row = asRecord(item);
    if (!row) continue;
    const id = text(row.id);
    const latitude = finite(row.latitude);
    const longitude = finite(row.longitude);
    if (id && latitude !== null && longitude !== null && notices < 3) {
      const title = text(row.judul) ?? text(row.title);
      actions.push({
        key: `notice:${id}`,
        type: "show_notice",
        label: title ? `Show ${title}` : "Show this notice",
        disruptionId: id,
        latitude,
        longitude,
      });
      notices += 1;
    }
    const url = httpUrl(row.url);
    if (url && sources < 2) {
      actions.push({ key: `source:${url}`, type: "open_source", label: "Read the source", url });
      sources += 1;
    }
  }
}

function pushStation(actions: ChatAction[], row: Record<string, unknown>, withEnds: boolean): void {
  if (row.ditemukan === false) return;
  const stationId = text(row.stationId);
  const name = text(row.name);
  const latitude = finite(row.latitude);
  const longitude = finite(row.longitude);
  if (!stationId || !name || latitude === null || longitude === null) return;
  const place = { stationId, name, latitude, longitude };
  actions.push({ key: `stop:${stationId}`, type: "show_stop", label: `Show ${name}`, ...place });
  if (!withEnds) return;
  actions.push({
    key: `origin:${stationId}`,
    type: "set_origin",
    label: `Use ${name} as the origin`,
    ...place,
  });
  actions.push({
    key: `destination:${stationId}`,
    type: "set_destination",
    label: `Use ${name} as the destination`,
    ...place,
  });
}

function placeName(value: unknown): string | null {
  const row = asRecord(value);
  if (!row) return null;
  return text(row.name) ?? text(row.text);
}

function dedupe(actions: ChatAction[]): ChatAction[] {
  const seen = new Set<string>();
  const unique: ChatAction[] = [];
  for (const action of actions) {
    if (seen.has(action.key)) continue;
    seen.add(action.key);
    unique.push(action);
  }
  return unique;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function httpUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return url.toString();
  } catch {
    return null;
  }
}
