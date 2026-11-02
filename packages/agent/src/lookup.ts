import { createTool } from "@anvia/core/tool";
import { z } from "zod";

import { stopsOnRoad, type RoadLookup } from "@daily-route/semantic";
import { lineDirections, serviceAt, type Station } from "@daily-route/transit";

import type { NetworkCache } from "./context.js";

/**
 * The read-only lookups the chat assistant shares with the notice reader.
 *
 * The notice reader uses its own copies because it tracks which ids the
 * model has already seen; the assistant only needs the answer. Both ask the
 * same resolver, network and road lookup, so a corridor or a street means
 * the same thing in a conversation and in a notice.
 */
export function createLookupTools(cache: NetworkCache, roads: RoadLookup) {
  const findLine = createTool({
    name: "find_line",
    description:
      "Find a corridor, bus line or rail line by its code or name. Returns the " +
      "line ids, codes, names, directions and their scheduled service window " +
      "at the requested instant. A line being listed does not mean it runs now.",
    inputSchema: z.object({
      codeOrName: z.string().trim().min(1).max(120).describe("A code (1, 4H, JAK.05, P11) or a line name"),
      at: z
        .string()
        .datetime({ offset: true })
        .optional()
        .describe("Instant to read the scheduled service window for; default now"),
    }),
    execute: async (args) => {
      const { network } = await cache.get();
      const at = args.at ? new Date(args.at) : new Date();
      const wanted = key(args.codeOrName);
      const found = network.lines
        .filter((line) => line.status === "operating")
        .filter((line) => {
          if (key(line.code) === wanted) return true;
          if (wanted.length < 4) return false;
          return (
            key(line.name).includes(wanted) ||
            line.aliases.some((alias) => key(alias).includes(wanted))
          );
        })
        .slice(0, 8);
      return {
        at: at.toISOString(),
        lines: found.map((line) => ({
          lineId: line.id,
          code: line.code,
          name: line.name,
          systemId: line.systemId,
          mode: line.mode,
          status: line.status,
          temporary: line.metadata?.["temporary"] === true,
          startsAt: typeof line.metadata?.["startsAt"] === "string" ? line.metadata["startsAt"] : null,
          endsAt: typeof line.metadata?.["endsAt"] === "string" ? line.metadata["endsAt"] : null,
          // Each direction is its own pattern; the label names both ends.
          // The service block is the only proof that the line runs now.
          directions: lineDirections(network, line.id).map((direction) => {
            const state = serviceAt(line, direction.direction, at);
            return {
              ...direction,
              service: state
                ? {
                    active: state.active,
                    reliable: state.reliable,
                    label: state.label,
                    detail: state.detail,
                    headwayMinMinutes: state.headwayMinMinutes,
                    headwayMaxMinutes: state.headwayMaxMinutes,
                    firstMinute: state.firstMinute,
                    lastMinute: state.lastMinute,
                  }
                : null,
            };
          }),
          patterns: (network.patterns ?? [])
            .filter((pattern) => pattern.lineId === line.id)
            .map((pattern) => ({
              patternId: pattern.id,
              headsign: pattern.headsign,
              direction: pattern.direction,
              type: pattern.patternType,
              service: pattern.serviceLabel,
              situational: pattern.metadata["situational"] === true,
              serviceNote: typeof pattern.metadata["serviceNote"] === "string" ? pattern.metadata["serviceNote"] : null,
              holidayService: pattern.metadata["holidays"] === true,
              toll: pattern.toll,
              isDefault: pattern.isDefault,
              stops: pattern.stopIds.length,
            })),
        })),
      };
    },
  });

  const listLineStops = createTool({
    name: "list_line_stops",
    description:
      "List the stops of one line in travel order, with their ids. Use it to " +
      "answer which stops a corridor serves before naming one.",
    inputSchema: z.object({
      lineId: z.string().min(1).describe("A line id from find_line"),
      direction: z
        .enum(["forward", "backward"])
        .optional()
        .describe("Limit to one direction; omit for both"),
      patternId: z
        .string()
        .optional()
        .describe("A pattern id from list_line_patterns; omit for the ordinary stop list"),
    }),
    execute: async (args) => {
      const { network } = await cache.get();
      const line = network.lines.find((candidate) => candidate.id === args.lineId);
      if (!line) return { found: false, lineId: args.lineId, stops: [] };
      const chosenPattern = args.patternId
        ? (network.patterns ?? []).find((pattern) => pattern.id === args.patternId)
        : null;
      const directions = lineDirections(network, line.id)
        .filter((entry) => !args.direction || entry.direction === args.direction)
        .map((entry) => ({
          direction: entry.direction,
          label: entry.label,
          from: entry.from,
          to: entry.to,
          pattern: chosenPattern?.id ?? null,
          stops: (chosenPattern
            ? chosenPattern.stopIds.map((stationId, index) => ({
                lineId: line.id,
                stationId,
                direction: entry.direction,
                position: index + 1,
                distanceFromOriginKm: null,
              }))
            : network.lineStops.filter(
                (stop) => stop.lineId === line.id && stop.direction === entry.direction,
              )
          )
            .sort((a, b) => a.position - b.position)
            .map((stop) => {
              const station = network.stations.find((candidate) => candidate.id === stop.stationId);
              return station
                ? {
                    stationId: station.id,
                    name: station.name,
                    position: stop.position,
                    latitude: station.latitude,
                    longitude: station.longitude,
                    platform: "platform" in stop ? (stop.platform ?? null) : null,
                  }
                : null;
            })
            .filter((stop): stop is NonNullable<typeof stop> => stop !== null),
        }));
      return {
        found: true,
        lineId: line.id,
        code: line.code,
        name: line.name,
        directions,
      };
    },
  });

  const listLinePatterns = createTool({
    name: "list_line_patterns",
    description:
      "List the scheduled patterns of one line when the same code has more " +
      "than one alignment, such as 8 via Tomang / via Cideng or 9 via toll. " +
      "Returns the headsign, service days and the stops each pattern skips.",
    inputSchema: z.object({
      lineId: z.string().min(1).describe("A line id from find_line"),
      direction: z
        .enum(["forward", "backward"])
        .optional()
        .describe("Limit to one direction; omit for both"),
    }),
    execute: async (args) => {
      const { network } = await cache.get();
      const line = network.lines.find((candidate) => candidate.id === args.lineId);
      const patterns = (network.patterns ?? []).filter(
        (pattern) =>
          pattern.lineId === args.lineId &&
          (!args.direction || pattern.direction === args.direction),
      );
      if (!line || patterns.length === 0) {
        return { found: Boolean(line), lineId: args.lineId, patterns: [] };
      }
      const nameOf = (stationId: string) =>
        network.stations.find((station) => station.id === stationId)?.name ?? stationId;
      return {
        found: true,
        lineId: line.id,
        code: line.code,
        name: line.name,
        patterns: patterns.map((pattern) => {
          const base = patterns.find((entry) => entry.direction === pattern.direction && entry.isDefault);
          const baseStops = new Set(base?.stopIds ?? []);
          return {
            patternId: pattern.id,
            headsign: pattern.headsign,
            direction: pattern.direction,
            type: pattern.patternType,
            service: pattern.serviceLabel,
            serviceDays: pattern.serviceDays,
            situational: pattern.metadata["situational"] === true,
            serviceNote: typeof pattern.metadata["serviceNote"] === "string" ? pattern.metadata["serviceNote"] : null,
            holidayService: pattern.metadata["holidays"] === true,
            toll: pattern.toll,
            isDefault: pattern.isDefault,
            stops: pattern.stopIds.map(nameOf),
            skipped: [...baseStops]
              .filter((stationId) => !pattern.stopIds.includes(stationId))
              .map(nameOf),
            extra: pattern.stopIds
              .filter((stationId) => !baseStops.has(stationId))
              .map(nameOf),
          };
        }),
      };
    },
  });

  const findStreet = createTool({
    name: "find_street",
    description:
      "Find a street in Greater Jakarta by name. A name can exist in several " +
      "districts; compare the coordinates before choosing one.",
    inputSchema: z.object({
      query: z.string().trim().min(2).max(160).describe("The street name as written"),
    }),
    execute: async (args) => {
      const found = await roads
        .search(args.query, { limit: 8 })
        .catch(() => []);
      return {
        streets: found.map((road) => ({
          streetId: road.id,
          name: road.name,
          latitude: road.latitude,
          longitude: road.longitude,
          lengthKm: road.lengthKm,
        })),
      };
    },
  });

  const stopsOnStreet = createTool({
    name: "stops_on_street",
    description:
      "Return the stops that stand on a named street, with the lines that serve " +
      "them. Use it to check whether a street touches a corridor the rider named.",
    inputSchema: z.object({
      query: z.string().trim().min(2).max(160).describe("The street name as written"),
      radiusMeters: z
        .number()
        .int()
        .min(15)
        .max(200)
        .optional()
        .describe("How far from the street centre a stop may stand"),
    }),
    execute: async (args) => {
      const [{ network }, found] = await Promise.all([
        cache.get(),
        roads.search(args.query, { limit: 4 }).catch(() => []),
      ]);
      const codes = codesByStation(network.lines, network.lineStops);
      return {
        streets: found.map((road) => ({
          streetId: road.id,
          name: road.name,
          stops: stopsOnRoad(
            road,
            network.stations as unknown as Station[],
            codes,
            args.radiusMeters ?? 60,
          ).map((stop) => ({
            stationId: stop.stationId,
            name: stop.name,
            systemId: stop.systemId,
            lineCodes: stop.lineCodes,
            meters: stop.meters,
          })),
        })),
      };
    },
  });

  return [findLine, listLineStops, listLinePatterns, findStreet, stopsOnStreet];
}

function codesByStation(
  lines: readonly { id: string; code: string }[],
  lineStops: readonly { lineId: string; stationId: string }[],
): Map<string, string[]> {
  const codeOf = new Map(lines.map((line) => [line.id, line.code]));
  const found = new Map<string, string[]>();
  for (const stop of lineStops) {
    const code = codeOf.get(stop.lineId);
    if (!code) continue;
    const codes = found.get(stop.stationId) ?? [];
    if (!codes.includes(code)) codes.push(code);
    found.set(stop.stationId, codes);
  }
  return found;
}

function key(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
