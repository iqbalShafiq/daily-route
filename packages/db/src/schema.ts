import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  smallint,
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
    /**
     * A stable slug for the event this notice describes.
     *
     * Two announcements about the same event share this key, so the newer
     * one refreshes the row instead of adding a duplicate. Null on notices
     * that predate the field or that the classifier could not group.
     */
    eventKey: text("event_key"),
    /** The instant the announcement itself says the effect ends. */
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /**
     * When the evidence should be checked again. It is chosen by the
     * classifier's duration assessment, not by a kind-to-hours table.
     * Null means no review is scheduled (an explicit end or legacy row).
     */
    reviewAt: timestamp("review_at", { withTimezone: true }),
    /** The last time a review agent looked at this notice. */
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    /** scheduled | due | verified | unverified */
    reviewState: text("review_state").notNull().default("none"),
    /** The model's horizon, reason, confidence and chosen cadence. */
    durationAssessment: jsonb("duration_assessment").notNull().default(sql`'{}'::jsonb`),
    /**
     * The verified impact windows.
     *
     * A running event can close one road in the morning and another route on
     * the next day; `ends_at` alone would make the notice look active for the
     * whole event.
     */
    validityWindows: jsonb("validity_windows").notNull().default(sql`'[]'::jsonb`),
    publishedAt: timestamp("published_at", { withTimezone: true }).notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull().defaultNow(),
    /** The last time a fresh announcement confirmed or refreshed this row. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    /** The last time the resolver looked for a closing announcement. */
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    /** How the row left the active board: operator, expiry, superseded. */
    resolvedReason: text("resolved_reason"),
    affectedStationIds: jsonb("affected_station_ids").notNull().default(sql`'[]'::jsonb`),
    affectedLineIds: jsonb("affected_line_ids").notNull().default(sql`'[]'::jsonb`),
    /**
     * What the notice is about: a stop, a corridor/line, or the operator.
     *
     * The board no longer splits notices into "on the map" and "without a
     * stop"; a notice about a corridor is drawn as that corridor.
     */
    scope: text("scope"),
    /**
     * The line codes as the announcement printed them.
     *
     * Kept next to the grounded ids because a code the network does not
     * have ("4H" before it enters the snapshot) is still what the rider
     * reads, and the board should say the corridor's name rather than
     * pretend the notice is about nothing.
     */
    lineCodes: jsonb("line_codes").notNull().default(sql`'[]'::jsonb`),
    /** The roads the announcement named, grounded against OpenStreetMap. */
    roads: jsonb("roads").notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("disruptions_status_idx").on(table.status),
    index("disruptions_event_idx").on(table.eventKey),
    index("disruptions_line_idx").on(table.lineId),
    index("disruptions_station_idx").on(table.stationId),
    index("disruptions_published_idx").on(table.publishedAt),
    index("disruptions_last_seen_idx").on(table.lastSeenAt),
    index("disruptions_review_idx").on(table.reviewAt),
    uniqueIndex("disruptions_source_external_unique").on(table.source, table.externalId),
  ],
);

export const linePatterns = pgTable(
  "line_patterns",
  {
    id: text("id").primaryKey(),
    lineId: text("line_id")
      .notNull()
      .references(() => lines.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    headsign: text("headsign").notNull(),
    direction: text("direction").notNull(),
    patternType: text("pattern_type").notNull().default("branch"),
    stopIds: jsonb("stop_ids").notNull().default(sql`'[]'::jsonb`),
    geometry: jsonb("geometry").notNull().default(sql`'[]'::jsonb`),
    stopOffsets: jsonb("stop_offsets").notNull().default(sql`'[]'::jsonb`),
    serviceDays: jsonb("service_days").notNull().default(sql`'[]'::jsonb`),
    serviceLabel: text("service_label").notNull().default("Daily"),
    toll: boolean("toll").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    source: text("source").notNull().default("gtfs"),
    sourceUrl: text("source_url"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    index("line_patterns_line_idx").on(table.lineId, table.direction),
    index("line_patterns_default_idx").on(table.lineId, table.direction, table.isDefault),
  ],
);

export const temporaryServices = pgTable(
  "temporary_services",
  {
    /** Stable id, normally derived from the event key by the writer. */
    id: text("id").primaryKey(),
    /** One row per announced event; a follow-up updates it. */
    eventKey: text("event_key").notNull().unique(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    systemId: text("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
    operator: text("operator").notNull(),
    mode: text("mode").notNull(),
    serviceClass: text("service_class").notNull(),
    color: text("color"),
    /**
     * Ordered directions, each with grounded station ids and its own
     * daily windows. A loop is one forward direction that returns to its
     * origin; a two-way shuttle has two entries.
     */
    directions: jsonb("directions").notNull().default(sql`'[]'::jsonb`),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    /** When the announcement should be read again; not an operational end. */
    reviewAt: timestamp("review_at", { withTimezone: true }),
    status: text("status").notNull().default("active"),
    /** The original Post, quote and images that justify this overlay. */
    source: jsonb("source").notNull().default(sql`'{}'::jsonb`),
    confidence: real("confidence").notNull().default(0),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("temporary_services_status_idx").on(table.status),
    index("temporary_services_start_idx").on(table.startsAt),
    index("temporary_services_system_idx").on(table.systemId),
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
    /**
     * Where the item stands in the classification queue.
     *
     * `processing` is a lease: `nextAttemptAt` is pushed into the future
     * while the model reads it, so a worker that dies mid-call leaves the
     * item claimable again instead of stuck forever.
     */
    classificationStatus: text("classification_status").notNull().default("pending"),
    classificationAttempts: integer("classification_attempts").notNull().default(0),
    classificationError: text("classification_error"),
    classifiedAt: timestamp("classified_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    /** The disruption this post was distilled into, when it produced one. */
    disruptionId: uuid("disruption_id").references(() => disruptions.id, { onDelete: "set null" }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (table) => [
    uniqueIndex("social_posts_platform_external_unique").on(table.platform, table.externalId),
    index("social_posts_author_idx").on(table.authorHandle),
    index("social_posts_published_idx").on(table.publishedAt),
    index("social_posts_queue_idx").on(table.classificationStatus, table.nextAttemptAt, table.publishedAt),
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

/**
 * What the application asked a paid provider to do.
 *
 * X and OpenRouter bill per call or per token, and the first question after a
 * surprising bill is always "which call". The row keeps the operation, the
 * provider that answered, the tokens or Posts, the estimated cost and enough
 * metadata to reconstruct it. The dashboard is a later concern.
 */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** "x" for the X API, "ai" for an OpenRouter completion. */
    kind: text("kind").notNull(),
    provider: text("provider").notNull(),
    /** chat, classifier, grounder, verifier, research, monitor, catch-up… */
    operation: text("operation").notNull(),
    model: text("model"),
    providerName: text("provider_name"),
    endpoint: text("endpoint"),
    status: text("status"),
    requests: integer("requests").notNull().default(1),
    posts: integer("posts").notNull().default(0),
    promptTokens: integer("prompt_tokens").notNull().default(0),
    completionTokens: integer("completion_tokens").notNull().default(0),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    latencyMs: integer("latency_ms"),
    traceId: text("trace_id"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("usage_events_created_idx").on(table.createdAt),
    index("usage_events_kind_idx").on(table.kind, table.createdAt),
  ],
);

/**
 * Accounts.
 *
 * These tables carry the rider's account, the session behind the cookie and
 * the places the rider asked to keep. They reference no transit table on
 * purpose: `pnpm db:seed` truncates the network with CASCADE, and a foreign
 * key from a memory item to a station would delete the rider's data with the
 * seed. The station reference in a payload is a read-time lookup, not a key.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * The address the rider signed up with, stored already trimmed and
     * lowercased by the writer. The column does not transform it, so a
     * lookup can use the exact string the writer produced.
     */
    email: text("email").notNull(),
    /** Produced outside this package; the layer stores the string only. */
    passwordHash: text("password_hash").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /**
     * A SHA-256 hex of the raw cookie, never the token itself, so a leaked
     * database snapshot does not hand out live sessions.
     */
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

/**
 * The rider's saved and recent state, kept as an opaque payload per item.
 *
 * A write that removes an item sets `deleted_at` instead of deleting the
 * row, so a browser that syncs incrementally can learn that the item is
 * gone. The cap on each kind is enforced by tombstoning the oldest rows.
 */
export const riderMemoryItems = pgTable(
  "rider_memory_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    itemKey: text("item_key").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("rider_memory_items_user_kind_key_unique").on(
      table.userId,
      table.kind,
      table.itemKey,
    ),
    index("rider_memory_items_user_updated_idx").on(table.userId, table.updatedAt),
    check(
      "rider_memory_items_kind_check",
      sql`${table.kind} in ('saved-place', 'recent-place', 'recent-journey', 'watch')`,
    ),
  ],
);

/**
 * The places a rider named ("Home", "Office", or a label of their own).
 *
 * The label is stored with the rider's spelling; the unique test is
 * `lower(label)`, so "Home" and "home" are one place. The payload is grounded
 * against the stations table when it is written and holds no foreign key:
 * `db:seed` truncates the network with CASCADE and must not take the rider's
 * places with it.
 */
export const riderPlaces = pgTable(
  "rider_places",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("rider_places_user_label_unique").on(table.userId, sql`lower(${table.label})`),
    index("rider_places_user_idx").on(table.userId),
  ],
);

/**
 * One journey a signed-in rider actually planned.
 *
 * A habit is derived from these rows, never stored as a promise: the planner
 * still decides whether a line runs. The station keys are text, not foreign
 * keys, for the same reason the places carry none.
 */
export const riderObservations = pgTable(
  "rider_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    originKey: text("origin_key").notNull(),
    destinationKey: text("destination_key").notNull(),
    originName: text("origin_name").notNull(),
    destinationName: text("destination_name").notNull(),
    originLabel: text("origin_label"),
    destinationLabel: text("destination_label"),
    lineCodes: jsonb("line_codes").notNull().default(sql`'[]'::jsonb`),
    /** 0 Sunday … 6 Saturday, in Asia/Jakarta. */
    weekday: smallint("weekday").notNull(),
    minuteOfDay: integer("minute_of_day").notNull(),
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("rider_observations_user_created_idx").on(table.userId, table.createdAt),
    check(
      "rider_observations_source_check",
      sql`${table.source} in ('plan', 'chat')`,
    ),
    check(
      "rider_observations_weekday_check",
      sql`${table.weekday} between 0 and 6`,
    ),
    check(
      "rider_observations_minute_check",
      sql`${table.minuteOfDay} between 0 and 1439`,
    ),
  ],
);

/**
 * A short-lived cache of public tool output.
 *
 * It deliberately has no user column: the entries are answers about the
 * network (a news result, a line lookup), never a chat answer or one rider's
 * places. Two riders asking the same thing therefore share one paid call.
 */
export const toolResultCache = pgTable("tool_result_cache", {
  cacheKey: text("cache_key").primaryKey(),
  value: jsonb("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memoryItems: many(riderMemoryItems),
  places: many(riderPlaces),
  observations: many(riderObservations),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const riderMemoryItemsRelations = relations(riderMemoryItems, ({ one }) => ({
  user: one(users, { fields: [riderMemoryItems.userId], references: [users.id] }),
}));

export const riderPlacesRelations = relations(riderPlaces, ({ one }) => ({
  user: one(users, { fields: [riderPlaces.userId], references: [users.id] }),
}));

export const riderObservationsRelations = relations(riderObservations, ({ one }) => ({
  user: one(users, { fields: [riderObservations.userId], references: [users.id] }),
}));
