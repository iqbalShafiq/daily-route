import type {
  ChatCard,
  ChatNoticeCard,
  ChatRouteCard,
  ChatRouteLeg,
  ChatRouteOption,
  ChatStopCard,
} from "@daily-route/transit";

/**
 * Turn a tool result into the semantic cards the chat interface renders.
 *
 * The interface never parses the model's prose for a station, a fare or a
 * duration. A card exists only when the tool returned the value.
 */
export function cardsFromTool(toolName: string, result: unknown): ChatCard[] {
  const row = asRecord(result);
  if (!row) return [];
  if (toolName === "plan_journey") return routeCards(row);
  if (toolName === "list_active_disruptions") return noticeCards(row["gangguan"]);
  if (toolName === "get_station") {
    const stop = stopCard(row);
    return stop ? [stop] : [];
  }
  if (toolName === "resolve_place") {
    const candidates = Array.isArray(row["candidates"]) ? row["candidates"] : [];
    for (const candidate of candidates) {
      const item = asRecord(candidate);
      if (!item) continue;
      const score = typeof item["score"] === "number" ? item["score"] : 0;
      if (score < 0.45) continue;
      const stop = stopCard(item);
      if (stop) return [stop];
    }
  }
  return [];
}

function routeCards(row: Record<string, unknown>): ChatCard[] {
  const routes = Array.isArray(row["rute"]) ? row["rute"] : [];
  const options: ChatRouteOption[] = [];
  for (const route of routes) {
    const option = routeOption(route);
    if (option) options.push(option);
  }
  const primary = options[0];
  if (!primary) return [];
  const asal = placeName(row["asal"]);
  const tujuan = placeName(row["tujuan"]);
  if (!asal || !tujuan) return [];
  const notices = noticeSummaries(row["gangguan"]);
  const card: ChatRouteCard = {
    type: "route",
    origin: asal,
    destination: tujuan,
    status: typeof row["status"] === "string" ? row["status"] : "tidak-diketahui",
    primary,
    alternatives: options.slice(1, 3),
    notices,
    note: Array.isArray(row["catatan"])
      ? (row["catatan"].find((entry): entry is string => typeof entry === "string") ?? null)
      : null,
  };
  return [card];
}

function routeOption(value: unknown): ChatRouteOption | null {
  const row = asRecord(value);
  if (!row) return null;
  const durationMinutes = finite(row["durasiMenit"]);
  if (durationMinutes === null) return null;
  const legs = (Array.isArray(row["legs"]) ? row["legs"] : [])
    .map(routeLeg)
    .filter((leg): leg is ChatRouteLeg => leg !== null);
  if (legs.length === 0) return null;
  const fare = asRecord(row["tarif"]);
  return {
    durationMinutes,
    distanceKm: finite(row["jarakKm"]) ?? 0,
    walkingKm: finite(row["jarakJalanKakiKm"]) ?? 0,
    transfers: finite(row["jumlahTransfer"]) ?? 0,
    fareLabel: fare ? text(fare["label"]) : null,
    fareTotal: fare ? finite(fare["total"]) : null,
    legs,
  };
}

function routeLeg(value: unknown): ChatRouteLeg | null {
  const row = asRecord(value);
  if (!row) return null;
  const kind = row["jenis"] === "walk" ? "walk" : "ride";
  const from = text(row["dari"]);
  const to = text(row["ke"]);
  if (!from || !to) return null;
  return {
    kind,
    mode: text(row["mode"]) ?? kind,
    lineCode: text(row["lineCode"]),
    lineName: text(row["lineName"]),
    serviceClass: text(row["serviceClass"]),
    from,
    to,
    durationMinutes: finite(row["durasiMenit"]) ?? 0,
    distanceKm: finite(row["jarakKm"]) ?? 0,
    waitMinutes: finite(row["tungguMenit"]) ?? 0,
    serviceLabel: text(row["frekuensi"]),
    headwayMinMinutes: finite(row["headwayMinMenit"]),
    headwayMaxMinutes: finite(row["headwayMaxMenit"]),
    outsideService: row["diLuarLayanan"] === true,
    serviceDetail: text(row["detailLayanan"]),
  };
}

function noticeCards(value: unknown): ChatCard[] {
  if (!Array.isArray(value)) return [];
  const cards: ChatNoticeCard[] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const id = text(row["id"]);
    const title = text(row["judul"]);
    if (!id || !title) continue;
    cards.push({
      type: "notice",
      id,
      title,
      severity: text(row["tingkat"]) ?? "info",
      kind: text(row["jenis"]) ?? "unknown",
      scope: text(row["lingkup"]) ?? "line",
      affects: text(row["memengaruhi"]) ?? "",
      role: text(row["peran"]) ?? "",
      url: httpUrl(row["url"]),
      latitude: finite(row["latitude"]),
      longitude: finite(row["longitude"]),
    });
    if (cards.length >= 4) break;
  }
  return cards;
}

function noticeSummaries(value: unknown): ChatRouteCard["notices"] {
  if (!Array.isArray(value)) return [];
  const rows: ChatRouteCard["notices"] = [];
  for (const entry of value) {
    const row = asRecord(entry);
    if (!row) continue;
    const id = text(row["id"]);
    const title = text(row["judul"]);
    if (!id || !title) continue;
    rows.push({
      id,
      title,
      severity: text(row["tingkat"]) ?? "info",
      scope: text(row["lingkup"]) ?? "line",
      role: text(row["peran"]) ?? "",
    });
    if (rows.length >= 3) break;
  }
  return rows;
}

function stopCard(value: Record<string, unknown>): ChatStopCard | null {
  if (value["ditemukan"] === false) return null;
  const stationId = text(value["stationId"]);
  const name = text(value["name"]);
  const latitude = finite(value["latitude"]);
  const longitude = finite(value["longitude"]);
  if (!stationId || !name || latitude === null || longitude === null) return null;
  const seenLines = new Set<string>();
  const lines = (Array.isArray(value["lines"]) ? value["lines"] : [])
    .map(asRecord)
    .filter((line): line is Record<string, unknown> => line !== null)
    .map((line) => ({
      code: text(line["code"]) ?? "",
      name: text(line["name"]) ?? "",
      serviceClass: text(line["serviceClass"]) ?? "",
    }))
    .filter((line) => {
      if (line.code.length === 0 || seenLines.has(line.code)) return false;
      seenLines.add(line.code);
      return true;
    });
  const departures = (Array.isArray(value["departures"]) ? value["departures"] : [])
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => ({
      code: text(row["code"]) ?? "",
      direction: row["direction"] === "backward" ? ("backward" as const) : ("forward" as const),
      headsign: text(row["headsign"]),
      serviceLabel: text(row["serviceLabel"]) ?? "Schedule not confirmed",
      headwayMinMinutes: finite(row["headwayMinMinutes"]),
      detail: text(row["detail"]),
      active: row["active"] !== false,
    }))
    .filter((row) => row.code.length > 0);
  return {
    type: "stop",
    stationId,
    name,
    systemId: text(value["systemId"]),
    latitude,
    longitude,
    area: text(value["area"]),
    lines,
    departures,
  };
}

function placeName(value: unknown): string | null {
  const row = asRecord(value);
  if (!row) return null;
  return text(row["name"]) ?? text(row["text"]);
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
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
