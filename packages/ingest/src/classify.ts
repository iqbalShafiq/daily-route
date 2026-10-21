import type { ServiceClass, TransitMode } from "@daily-route/transit";

/**
 * Classification of raw OSM route relations into the domain model.
 *
 * OpenStreetMap records the service class inside the relation's name — for
 * example "Metrotrans 5F: Masjid Jami Al Makmur → Stasiun Tebet" — and the
 * operator inside the `network` tag. Both are read here, once.
 */

export type SystemId =
  | "transjakarta"
  | "mrt-jakarta"
  | "lrt-jakarta"
  | "lrt-jabodebek"
  | "krl-jabodetabek";

export type SystemDefinition = {
  id: SystemId;
  name: string;
  mode: TransitMode;
  operator: string;
  color: string;
  website: string | null;
  description: string;
};

/** The systems this platform covers. */
export const SYSTEMS: readonly SystemDefinition[] = [
  {
    id: "transjakarta",
    name: "Transjakarta",
    mode: "bus",
    operator: "PT Transportasi Jakarta",
    color: "#0b6b4f",
    website: "https://transjakarta.co.id",
    description:
      "Bus operasional Transjakarta: koridor BRT, Metrotrans (non-BRT), Royaltrans, Minitrans, Mikrotrans dan Amari.",
  },
  {
    id: "mrt-jakarta",
    name: "MRT Jakarta",
    mode: "metro",
    operator: "PT MRT Jakarta Perseroda",
    color: "#0f5aa8",
    website: "https://jakartamrt.co.id",
    description:
      "Mass Rapid Transit Jakarta. Lin Utara–Selatan telah beroperasi sejak 2019 (Lebak Bulus–Bundaran HI, 13 stasiun); Lin Timur–Barat masih dalam konstruksi (Tahap 1 Tomang–Medan Satria).",
  },
  {
    id: "lrt-jakarta",
    name: "LRT Jakarta",
    mode: "tram",
    operator: "PT LRT Jakarta",
    color: "#c2410c",
    website: "https://www.lrtjakarta.co.id",
    description:
      "LRT Jakarta: 11 stasiun, 12,2 km, Kelapa Gading–Manggarai. Fase 1B sampai Manggarai-Service Center dibuka 16 September 2026.",
  },
  {
    id: "lrt-jabodebek",
    name: "LRT Jabodebek",
    mode: "tram",
    operator: "PT LRT Jabodebek",
    color: "#7c3aed",
    website: "https://lrtjabodebek.kai.id",
    description:
      "LRT Jabodebek: 18 stasiun, dibuka 28 Agustus 2023. Dua cabang dari trunk Dukuh Atas–Cawang: Cibubur–Harjamukti dan Bekasi–Jati Mulya.",
  },
  {
    id: "krl-jabodetabek",
    name: "KRL Jabodetabek",
    mode: "rail",
    operator: "PT Kereta Api Indonesia (KAI Commuter)",
    color: "#b45309",
    website: "https://www.kci.id",
    description:
      "Kereta api commuter Jabodetabek: Lin Bogor, Lin Cikarang, Lin Rangkasbitung, Lin Tangerang, dan Lin Tanjung Priok.",
  },
];

/**
 * Map an OSM relation to the system that operates it.
 *
 * Returns `null` for relations that belong to other operators (Tanggerang,
 * Depok, the whole-country KAI services).
 */
export function systemForRelation(tags: Record<string, string>): SystemId | null {
  const network = (tags["network"] ?? "").toLowerCase();
  const operator = (tags["operator"] ?? "").toLowerCase();
  const route = tags["route"] ?? "";
  const name = (tags["name"] ?? "").toLowerCase();

  if (network.includes("transjakarta") || network.includes("trans jakarta")) {
    return "transjakarta";
  }
  if (network.includes("mrt jakarta") || name.includes("mrt jakarta")) {
    return "mrt-jakarta";
  }
  if (network.includes("jabodebek")) {
    return "lrt-jabodebek";
  }
  if (network.includes("lrt jakarta")) {
    return "lrt-jakarta";
  }
  if (network.includes("kai commuter")) {
    // "KAI Commuter" is the network KAI uses for the Jabodetabek suburban
    // lines. The long-distance services are tagged "KAI" and are outside
    // this platform's scope.
    return "krl-jabodetabek";
  }
  if (network.includes("kai")) {
    return null;
  }
  if (operator.includes("lrt jabodebek")) {
    return "lrt-jabodebek";
  }
  if (operator.includes("pt lrt jakarta")) {
    return "lrt-jakarta";
  }
  if (operator.includes("pt mrt jakarta")) {
    return "mrt-jakarta";
  }
  if (route === "subway" && network.includes("mrt")) {
    return "mrt-jakarta";
  }
  if (route === "light_rail" && name.includes("lrt")) {
    return "lrt-jakarta";
  }
  return null;
}

/** The service class of a Transjakarta route, read from its relation name. */
export type TransjakartaClass = {
  serviceClass: ServiceClass;
  /** The brand as Transjakarta writes it, e.g. "Metrotrans". */
  brand: string;
};

/**
 * The brands the operator names on its vehicles, and the kind of service
 * each of them is.
 *
 * The relation names in OpenStreetMap state the brand outright
 * ("Minitrans 1M", "Bus Wisata 4", "Transjakarta Amari M3"), which is
 * more precise than the fleet tier. The operator's own corridor list
 * outranks this table where the two disagree.
 */
const TRANSAKARTA_CLASSES: readonly { pattern: RegExp; brand: string; serviceClass: ServiceClass }[] = [
  { pattern: /^mikrotrans/i, brand: "Mikrotrans", serviceClass: "mikrotrans" },
  { pattern: /^metrotrans/i, brand: "Metrotrans", serviceClass: "non-brt" },
  { pattern: /^royaltrans/i, brand: "Royaltrans", serviceClass: "royaltrans" },
  { pattern: /^minitrans/i, brand: "Minitrans", serviceClass: "minitrans" },
  { pattern: /^amari/i, brand: "Amari", serviceClass: "amari" },
  { pattern: /^bus wisata/i, brand: "Bus Wisata", serviceClass: "wisata" },
  { pattern: /^transjabodetabek/i, brand: "Transjabodetabek", serviceClass: "transjabodetabek" },
  { pattern: /^transjakarta\s+brt/i, brand: "BRT", serviceClass: "brt" },
  { pattern: /^transjakarta/i, brand: "Transjakarta", serviceClass: "non-brt" },
];

/** Classify a Transjakarta route from its relation name. */
export function classifyTransjakartaRoute(name: string): TransjakartaClass {
  for (const entry of TRANSAKARTA_CLASSES) {
    if (entry.pattern.test(name.trim())) {
      return { serviceClass: entry.serviceClass, brand: entry.brand };
    }
  }
  return { serviceClass: "non-brt", brand: "Transjakarta" };
}

/** The service class used for a rail line. */
export function railServiceClass(mode: TransitMode): ServiceClass {
  if (mode === "metro") return "rapid-transit";
  if (mode === "tram") return "lrt";
  return "commuter-rail";
}
