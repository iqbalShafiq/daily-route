import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

/**
 * The transit schema.
 *
 * The model separates three things that are easy to conflate:
 *
 * - a **system** is who operates the service (Transjakarta, MRT Jakarta, …);
 * - a **line** is one specific corridor or route inside that system, and it
 *   carries the service class (BRT, feeder, metro, commuter rail, …);
 * - a **station** is a physical place where vehicles stop.
 *
 * Stations that are the same physical place but belong to different systems
 * are linked by a **station group**; that is what makes an interchange a
 * transfer instead of two unrelated stops.
 */

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const systems = pgTable("systems", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  mode: text("mode").notNull(),
  operator: text("operator").notNull(),
  description: text("description").notNull().default(""),
  color: text("color").notNull().default("#0f172a"),
  website: text("website"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ...timestamps,
});

export const lines = pgTable(
  "lines",
  {
    id: text("id").primaryKey(),
    systemId: text("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    mode: text("mode").notNull(),
    serviceClass: text("service_class").notNull(),
    operator: text("operator").notNull(),
    status: text("status").notNull().default("operating"),
    color: text("color"),
    lengthKm: real("length_km"),
    description: text("description").notNull().default(""),
    aliases: jsonb("aliases").notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("lines_system_code_unique").on(table.systemId, table.code),
    index("lines_system_idx").on(table.systemId),
    index("lines_service_class_idx").on(table.serviceClass),
  ],
);

export const stations = pgTable(
  "stations",
  {
    id: text("id").primaryKey(),
    systemId: text("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    stationType: text("station_type").notNull().default("stop"),
    zone: text("zone"),
    isInterchange: boolean("is_interchange").notNull().default(false),
    /**
     * How many lines serve this station.
     *
     * It is the measure of how well connected a place is, and it decides
     * which of two stations of the same name a rider meant.
     */
    lineCount: integer("line_count").notNull().default(0),
    description: text("description").notNull().default(""),
    area: text("area"),
    aliases: jsonb("aliases").notNull().default(sql`'[]'::jsonb`),
    /** Normalised text used for lexical and trigram matching. */
    searchText: text("search_text").notNull().default(""),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("stations_system_name_unique").on(table.systemId, table.name),
    index("stations_system_idx").on(table.systemId),
    index("stations_coordinates_idx").on(table.latitude, table.longitude),
    index("stations_interchange_idx").on(table.isInterchange),
  ],
);

/**
 * The real path of a line, per direction.
 *
 * The geometry is the flat list of coordinates the vehicles travel, and
 * `stop_offsets` says where every stop sits along it. The planner slices
 * this path per leg, so the line drawn on the map is the road the bus
 * actually drives on.
 */
export const lineGeometry = pgTable(
  "line_geometry",
  {
    lineId: text("line_id")
      .notNull()
      .references(() => lines.id, { onDelete: "cascade" }),
    direction: text("direction").notNull().default("forward"),
    /** Flat `[longitude, latitude, …]` pairs. */
    geometry: jsonb("geometry").notNull(),
    /** The index in `geometry` of every stop, parallel to the line's stops. */
    stopOffsets: jsonb("stop_offsets").notNull().default(sql`'[]'::jsonb`),
    lengthKm: real("length_km").notNull(),
    pointCount: integer("point_count").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.lineId, table.direction] }),
  ],
);

/**
 * The published tariffs.
 *
 * There is one row: the rules in force today. The table exists so that
 * the fares, like the rest of the network, are data the application reads
 * rather than constants it carries.
 */
export const fareRules = pgTable("fare_rules", {
  id: text("id").primaryKey(),
  rules: jsonb("rules").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const lineStops = pgTable(
  "line_stops",
  {
    lineId: text("line_id")
      .notNull()
      .references(() => lines.id, { onDelete: "cascade" }),
    stationId: text("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    direction: text("direction").notNull().default("forward"),
    position: integer("position").notNull(),
    distanceFromOriginKm: real("distance_from_origin_km"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    // A loop route visits the same station twice in one direction, so the
    // position is part of the key: the row identifies an occurrence, not a
    // station.
    primaryKey({ columns: [table.lineId, table.stationId, table.direction, table.position] }),
    index("line_stops_station_idx").on(table.stationId),
    index("line_stops_line_position_idx").on(table.lineId, table.direction, table.position),
  ],
);

export const stationGroups = pgTable(
  "station_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    latitude: doublePrecision("latitude").notNull(),
    longitude: doublePrecision("longitude").notNull(),
    description: text("description").notNull().default(""),
    aliases: jsonb("aliases").notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [index("station_groups_coordinates_idx").on(table.latitude, table.longitude)],
);

export const stationGroupMembers = pgTable(
  "station_group_members",
  {
    groupId: text("group_id")
      .notNull()
      .references(() => stationGroups.id, { onDelete: "cascade" }),
    stationId: text("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    /** Walking time between the two stations of the group, in minutes. */
    walkMinutes: real("walk_minutes"),
  },
  (table) => [
    primaryKey({ columns: [table.groupId, table.stationId] }),
    index("station_group_members_station_idx").on(table.stationId),
  ],
);

/** A single embeddable document per station, used for semantic search. */
export const stationEmbeddings = pgTable(
  "station_embeddings",
  {
    stationId: text("station_id")
      .notNull()
      .references(() => stations.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.stationId, table.model] }),
    index("station_embeddings_model_idx").on(table.model),
  ],
);

export const disruptions = pgTable(
  "disruptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: text("source").notNull(),
    sourceType: text("source_type").notNull(),
    externalId: text("external_id"),
    systemId: text("system_id").references(() => systems.id, { onDelete: "set null" }),
    lineId: text("line_id").references(() => lines.id, { onDelete: "set null" }),
    stationId: text("station_id").references(() => stations.id, { onDelete: "set null" }),
    stationGroupId: text("station_group_id").references(() => stationGroups.id, {
      onDelete: "set null",
    }),
    severity: text("severity").notNull().default("info"),
    status: text("status").notNull().default("active"),
    kind: text("kind").notNull().default("unknown"),
    title: text("title").notNull(),
    body: text("body").notNull().default(""),
    url: text("url"),
    confidence: real("confidence").notNull().default(1),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    affectedStationIds: jsonb("affected_station_ids").notNull().default(sql`'[]'::jsonb`),
    affectedLineIds: jsonb("affected_line_ids").notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("disruptions_status_idx").on(table.status),
    index("disruptions_line_idx").on(table.lineId),
    index("disruptions_station_idx").on(table.stationId),
    index("disruptions_published_idx").on(table.publishedAt),
    uniqueIndex("disruptions_source_external_unique").on(table.source, table.externalId),
  ],
);

export const socialPosts = pgTable(
  "social_posts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    platform: text("platform").notNull().default("x"),
    externalId: text("external_id").notNull(),
    authorHandle: text("author_handle").notNull(),
    authorName: text("author_name"),
    text: text("text").notNull(),
    url: text("url").notNull(),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    /** The disruption this post was distilled into, when it produced one. */
    disruptionId: uuid("disruption_id").references(() => disruptions.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("social_posts_platform_external_unique").on(table.platform, table.externalId),
    index("social_posts_author_idx").on(table.authorHandle),
    index("social_posts_published_idx").on(table.publishedAt),
  ],
);

export const newsItems = pgTable(
  "news_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    url: text("url").notNull(),
    content: text("content").notNull().default(""),
    source: text("source"),
    query: text("query"),
    score: real("score"),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true }).notNull().defaultNow(),
    disruptionId: uuid("disruption_id").references(() => disruptions.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("news_items_url_unique").on(table.url),
    index("news_items_published_idx").on(table.publishedAt),
  ],
);

export const agentSessions = pgTable(
  "agent_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull().default("Percakapan rute"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [index("agent_sessions_updated_idx").on(table.updatedAt)],
);

export const agentMessages = pgTable(
  "agent_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull().default(""),
    parts: jsonb("parts").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agent_messages_session_idx").on(table.sessionId, table.createdAt)],
);

export const routePlans = pgTable(
  "route_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    originStationId: text("origin_station_id").references(() => stations.id, {
      onDelete: "set null",
    }),
    destinationStationId: text("destination_station_id").references(() => stations.id, {
      onDelete: "set null",
    }),
    originText: text("origin_text").notNull().default(""),
    destinationText: text("destination_text").notNull().default(""),
    itineraries: jsonb("itineraries").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("route_plans_created_idx").on(table.createdAt)],
);

export const systemsRelations = relations(systems, ({ many }) => ({
  lines: many(lines),
  stations: many(stations),
}));

export const linesRelations = relations(lines, ({ one, many }) => ({
  system: one(systems, { fields: [lines.systemId], references: [systems.id] }),
  stops: many(lineStops),
}));

export const stationsRelations = relations(stations, ({ one, many }) => ({
  system: one(systems, { fields: [stations.systemId], references: [systems.id] }),
  stops: many(lineStops),
  embeddings: many(stationEmbeddings),
}));

export const lineStopsRelations = relations(lineStops, ({ one }) => ({
  line: one(lines, { fields: [lineStops.lineId], references: [lines.id] }),
  station: one(stations, { fields: [lineStops.stationId], references: [stations.id] }),
}));

export const stationGroupsRelations = relations(stationGroups, ({ many }) => ({
  members: many(stationGroupMembers),
}));

export const stationGroupMembersRelations = relations(stationGroupMembers, ({ one }) => ({
  group: one(stationGroups, { fields: [stationGroupMembers.groupId], references: [stationGroups.id] }),
  station: one(stations, {
    fields: [stationGroupMembers.stationId],
    references: [stations.id],
  }),
}));

export const stationEmbeddingsRelations = relations(stationEmbeddings, ({ one }) => ({
  station: one(stations, { fields: [stationEmbeddings.stationId], references: [stations.id] }),
}));
