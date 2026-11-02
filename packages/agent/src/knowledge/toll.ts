import raw from "../../../../data/toll-roads.json";

/**
 * Toll roads are not a second network. They explain how a service can skip
 * a stretch of stops: the bus leaves the ordinary road, runs on the toll,
 * and rejoins after the affected stops. A stop on the old road can be
 * passed without being served, which is different from the whole journey
 * being closed.
 *
 * `confirmed` is stated by an official route page or a news report;
 * `reported` comes from route listings and must be described as such;
 * `conditional` is only true for some trips or some diversions.
 */
export type TollConfidence = "confirmed" | "reported" | "conditional";

export type TollRoad = {
  id: string;
  name: string;
  aliases: string[];
  cities: string[];
  gates: string[];
  sources: string[];
};

export type TollService = {
  lineCode: string;
  mode: "regular" | "conditional";
  roads: string[];
  confidence: TollConfidence;
  note: string;
  sources: string[];
};

const roads = raw.roads as TollRoad[];
const services = raw.services as TollService[];

export function tollRoads(): readonly TollRoad[] {
  return roads;
}

export function tollServices(): readonly TollService[] {
  return services;
}

export function tollRoadById(id: string): TollRoad | null {
  return roads.find((road) => road.id === id) ?? null;
}

export function tollInfoForLine(lineCode: string): {
  service: TollService;
  roads: TollRoad[];
} | null {
  const code = lineCode.trim().toUpperCase();
  const service = services.find((item) => item.lineCode.toUpperCase() === code);
  if (!service) return null;
  return {
    service,
    roads: service.roads.flatMap((id) => {
      const road = tollRoadById(id);
      return road ? [road] : [];
    }),
  };
}

export function searchToll(input: { lineCode?: string | undefined; toll?: string | undefined }): {
  services: TollService[];
  roads: TollRoad[];
} {
  const code = input.lineCode?.trim().toUpperCase() ?? "";
  const term = input.toll?.trim().toLowerCase() ?? "";
  const matchedRoads = term
    ? roads.filter((road) =>
        [road.id, road.name, ...road.aliases, ...road.gates]
          .join(" ")
          .toLowerCase()
          .includes(term),
      )
    : [];
  const roadIds = new Set(matchedRoads.map((road) => road.id));
  const matchedServices = services.filter((service) => {
    if (code && service.lineCode.toUpperCase() !== code) return false;
    if (term && !service.roads.some((id) => roadIds.has(id))) return false;
    return true;
  });
  const serviceRoadIds = new Set(matchedServices.flatMap((service) => service.roads));
  return {
    services: matchedServices,
    roads: term ? matchedRoads : roads.filter((road) => serviceRoadIds.has(road.id)),
  };
}
