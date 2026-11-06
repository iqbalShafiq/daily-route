import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
  deleteRiderPlace,
  deleteSession,
  deleteUser,
  findSession,
  findUserByEmail,
  insertSession,
  insertUser,
  listActiveDisruptions,
  listMemory,
  listRecentObservations,
  listRiderPlaces,
  MEMORY_KINDS,
  updatePassword,
  upsertMemory,
  upsertRiderPlace,
} from "@daily-route/db";
import type {
  AccountSession,
  MemoryPayload,
  MemoryWrite,
  RiderPlaceFailureReason,
} from "@daily-route/db";
import {
  habitsFrom,
  isActiveAt,
  noticesForHabit,
  type HabitNotice,
  type NoticeTimeline,
  type ValidityWindow,
} from "@daily-route/transit";

import { readAccountSession } from "../account-session.js";
import type { ApiDeps } from "../deps.js";
import { hashPassword, verifyPassword } from "../password.js";
import {
  clearSessionCookie,
  hashSessionToken,
  newSessionToken,
  readSessionToken,
  secureCookie,
  sessionCookie,
  sessionMaxAgeSeconds,
  SESSION_TTL_MS,
} from "../session-cookie.js";

/**
 * The account endpoints.
 *
 * The only identity here is the session cookie: no route reads a user id
 * from the body or the query, and the database rows cascade from the user,
 * so deleting the account removes its sessions and its memory with it.
 *
 * Every mutation is refused unless the request came from the web origin.
 * The cookie is `SameSite=Lax`, which already keeps it away from a
 * cross-site form post; the exact origin check is the second lock, and it
 * costs nothing because the browser always sends the header.
 */

const emailSchema = z.string().trim().toLowerCase().pipe(z.email());

const passwordSchema = z.string().min(8).max(200);

const credentialsSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  password: passwordSchema,
});

const passwordOnlySchema = z.object({
  password: z.string().min(1).max(200),
});

const memoryItemSchema = z.object({
  kind: z.enum(MEMORY_KINDS),
  itemKey: z.string().min(1).max(400),
  payload: z.unknown().optional(),
  deleted: z.boolean().optional(),
});

const memoryWriteSchema = z.object({
  items: z.array(memoryItemSchema).min(1).max(40),
});

const riderPlaceSchema = z.object({
  label: z.string().min(1).max(64),
  payload: z.unknown(),
});

const REFUSED = "This request was refused.";
const SIGN_IN_REQUIRED = "Sign in to continue.";
const WRONG_PASSWORD = "Email or password is wrong.";
const CURRENT_PASSWORD_WRONG = "The current password is wrong.";
const TOO_MANY = "Too many attempts. Try again later.";

/** Which rule a malformed credential body broke, in the words the rider sees. */
function credentialError(error: z.ZodError): string {
  const emailIssue = error.issues.some(
    (issue) => issue.path.length === 0 || issue.path[0] === "email",
  );
  return emailIssue ? "Enter a valid email." : "Use at least 8 characters.";
}

/** The address the limiter groups by. A missing socket still needs a key. */
function clientOf(request: Request): string {
  return request.ip ?? "unknown";
}

/**
 * Turn a wire item into the write the database layer expects.
 *
 * The payload is deliberately passed through as it arrived: the database
 * grounds it against its kind and answers with a failure for a shape it
 * cannot store. Narrowing it here as well would give the API a second,
 * slightly different copy of that rule.
 */
function memoryWriteOf(item: z.infer<typeof memoryItemSchema>): MemoryWrite {
  const write: MemoryWrite = {
    kind: item.kind,
    itemKey: item.itemKey,
    deleted: item.deleted ?? false,
  };
  if (item.payload === undefined) return write;
  write.payload = item.payload as MemoryPayload;
  return write;
}

export function createAccountRouter(deps: ApiDeps): Router {
  const router = Router();
  const secure = secureCookie(deps.env);

  router.use((request, response, next) => {
    if (request.method === "GET" || request.method === "HEAD") {
      next();
      return;
    }
    // An exact match, never a reflection of whatever origin called: a
    // reflected origin would let any page drive a signed-in rider's account.
    if (request.headers.origin !== deps.env.WEB_ORIGIN) {
      response.status(403).json({ error: REFUSED });
      return;
    }
    next();
  });

  /**
   * The signed-in user, or null after the response has been refused.
   *
   * The cookie lookup lives in `account-session.ts`, so the plan and chat
   * routes answer for the same rider without their own copy of the rule.
   */
  const requireSession = async (
    request: Request,
    response: Response,
  ): Promise<AccountSession | null> => {
    const session = await readAccountSession(deps, request, response);
    if (session === null) {
      response.status(401).json({ error: SIGN_IN_REQUIRED });
    }
    return session;
  };

  /** Insert a session and hand its token to the browser. */
  const startSession = async (response: Response, userId: string): Promise<void> => {
    const token = newSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    await insertSession(deps.db, {
      userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
    });
    response.setHeader("Set-Cookie", sessionCookie(token, secure, sessionMaxAgeSeconds()));
  };

  router.post("/", async (request, response) => {
    const body: unknown = request.body;
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) {
      response.status(400).json({ error: credentialError(parsed.error) });
      return;
    }

    const { email, password } = parsed.data;
    const key = `sign-up:${clientOf(request)}:${email}`;
    if (deps.attempts.blocked(key)) {
      response.status(429).json({ error: TOO_MANY });
      return;
    }

    const passwordHash = await hashPassword(password);
    const created = await insertUser(deps.db, { email, passwordHash });
    if (!created.ok) {
      // A taken address is a failed attempt at the same key, so probing
      // whether an address is registered is slowed down too.
      deps.attempts.fail(key);
      response.status(409).json({ error: "That email is already registered." });
      return;
    }

    await startSession(response, created.user.id);
    response.status(201).json({ user: created.user });
  });

  router.post("/session", async (request, response) => {
    const body: unknown = request.body;
    const parsed = credentialsSchema.safeParse(body);
    if (!parsed.success) {
      response.status(400).json({ error: credentialError(parsed.error) });
      return;
    }

    const { email, password } = parsed.data;
    const key = `sign-in:${clientOf(request)}:${email}`;
    if (deps.attempts.blocked(key)) {
      response.status(429).json({ error: TOO_MANY });
      return;
    }

    const user = await findUserByEmail(deps.db, email);
    // An unknown address goes through the same derivation as a wrong
    // password, against a fixed dummy hash, so the two answers are both
    // "no" and take the same time.
    const matches = await verifyPassword(password, user?.passwordHash ?? null);
    if (!user || !matches) {
      deps.attempts.fail(key);
      response.status(401).json({ error: WRONG_PASSWORD });
      return;
    }

    deps.attempts.succeed(key);
    await startSession(response, user.id);
    response.json({ user: { id: user.id, email: user.email } });
  });

  router.delete("/session", async (request, response) => {
    const token = readSessionToken(request.headers.cookie);
    if (token !== null) {
      const session = await findSession(deps.db, hashSessionToken(token));
      if (session !== null) {
        await deleteSession(deps.db, session.id);
      }
    }
    // A rider who is already signed out still gets a clean answer, and the
    // browser is told to drop whatever it still holds.
    response.setHeader("Set-Cookie", clearSessionCookie(secure));
    response.status(204).end();
  });

  router.get("/", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;
    response.json({ user: { id: session.userId, email: session.email } });
  });

  router.post("/password", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;

    const body: unknown = request.body;
    const parsed = passwordChangeSchema.safeParse(body);
    if (!parsed.success) {
      const passwordIssue = parsed.error.issues.some((issue) => issue.path[0] === "password");
      response.status(passwordIssue ? 400 : 401).json({
        error: passwordIssue ? "Use at least 8 characters." : CURRENT_PASSWORD_WRONG,
      });
      return;
    }

    const user = await findUserByEmail(deps.db, session.email);
    if (!user || user.id !== session.userId) {
      response.setHeader("Set-Cookie", clearSessionCookie(secure));
      response.status(401).json({ error: SIGN_IN_REQUIRED });
      return;
    }

    // A stolen session must not be able to grind the password. The same
    // window that slows a sign-in guess slows a change and a deletion.
    const key = `password:${session.userId}`;
    if (deps.attempts.blocked(key)) {
      response.status(429).json({ error: TOO_MANY });
      return;
    }

    const matches = await verifyPassword(parsed.data.currentPassword, user.passwordHash);
    if (!matches) {
      deps.attempts.fail(key);
      response.status(401).json({ error: CURRENT_PASSWORD_WRONG });
      return;
    }

    deps.attempts.succeed(key);
    const passwordHash = await hashPassword(parsed.data.password);
    await updatePassword(deps.db, user.id, passwordHash);
    response.status(204).end();
  });

  router.delete("/", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;

    const body: unknown = request.body;
    const parsed = passwordOnlySchema.safeParse(body);
    const user = await findUserByEmail(deps.db, session.email);
    if (!user || user.id !== session.userId) {
      response.setHeader("Set-Cookie", clearSessionCookie(secure));
      response.status(401).json({ error: SIGN_IN_REQUIRED });
      return;
    }

    const key = `delete:${session.userId}`;
    if (deps.attempts.blocked(key)) {
      response.status(429).json({ error: TOO_MANY });
      return;
    }

    const matches = await verifyPassword(
      parsed.success ? parsed.data.password : "",
      user.passwordHash,
    );
    if (!matches) {
      deps.attempts.fail(key);
      response.status(401).json({ error: CURRENT_PASSWORD_WRONG });
      return;
    }

    deps.attempts.succeed(key);

    // The sessions and the memory rows cascade from the user row, so this
    // one delete is the whole account.
    await deleteUser(deps.db, user.id);
    response.setHeader("Set-Cookie", clearSessionCookie(secure));
    response.status(204).end();
  });

  router.get("/memory", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;

    const raw = request.query["after"];
    let after: Date | undefined;
    if (raw !== undefined) {
      const value = typeof raw === "string" ? raw : null;
      const parsed = value === null ? null : new Date(value);
      if (!parsed || Number.isNaN(parsed.getTime())) {
        response.status(400).json({ error: "That time is not valid." });
        return;
      }
      after = parsed;
    }

    const items = await listMemory(deps.db, session.userId, after);
    response.json({ items });
  });

  router.put("/memory", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;

    const body: unknown = request.body;
    const parsed = memoryWriteSchema.safeParse(body);
    if (!parsed.success) {
      response.status(400).json({ error: "That place could not be saved." });
      return;
    }

    const result = await upsertMemory(
      deps.db,
      session.userId,
      parsed.data.items.map((item) => memoryWriteOf(item)),
    );
    if (!result.ok) {
      response.status(400).json({
        error:
          result.reason === "unknown-station"
            ? "That stop is not on the network."
            : "That place could not be saved.",
      });
      return;
    }

    response.json({ items: result.items });
  });

  /**
   * The places a rider named.
   *
   * The label is the rider's own word; the database owns the rules about
   * length, case-insensitive replacement and the cap. The API only turns a
   * refusal into words the rider can act on.
   */
  router.get("/places", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;
    response.json({ places: await listRiderPlaces(deps.db, session.userId) });
  });

  router.post("/places", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;

    const parsed = riderPlaceSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ error: "Use a name of 1 to 32 characters." });
      return;
    }

    const result = await upsertRiderPlace(deps.db, session.userId, {
      label: parsed.data.label,
      payload: parsed.data.payload,
    });
    if (!result.ok) {
      response
        .status(result.reason === "too-many" ? 409 : 400)
        .json({ error: riderPlaceError(result.reason) });
      return;
    }
    response.json({ places: result.places });
  });

  router.delete("/places/:label", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;

    const label = request.params["label"] ?? "";
    const removed = await deleteRiderPlace(deps.db, session.userId, label);
    response.json({ removed, places: await listRiderPlaces(deps.db, session.userId) });
  });

  /**
   * The usual journeys, with the stored notices that touch them.
   *
   * This reads the notice table only. It does not call X, Tavily or a model:
   * the worker already holds the one stream, and an alert is a stored fact
   * about the network, not a new fetch.
   */
  router.get("/alerts", async (request, response) => {
    const session = await requireSession(request, response);
    if (session === null) return;

    const now = new Date();
    const since = new Date(now.getTime() - 28 * 24 * 60 * 60_000);
    const [observations, rows] = await Promise.all([
      listRecentObservations(deps.db, session.userId, since),
      listActiveDisruptions(deps.db, { limit: 200 }),
    ]);

    const habits = habitsFrom(observations, now);
    const notices = rows
      .filter((row) => isActiveAt(timelineOf(row), now))
      .map((row) => habitNoticeOf(row));

    response.json({
      alerts: habits
        .map((habit) => ({ habit, notices: noticesForHabit(habit, notices, now) }))
        .filter((alert) => alert.notices.length > 0),
    });
  });

  return router;
}

/** Which rule a named-place write broke, in the words the rider sees. */
function riderPlaceError(reason: RiderPlaceFailureReason): string {
  if (reason === "invalid-label") return "Use a name of 1 to 32 characters.";
  if (reason === "unknown-station") return "That stop is not on the network.";
  if (reason === "too-many") return "You can save up to 16 places.";
  return "That place could not be saved.";
}

type NoticeRow = Awaited<ReturnType<typeof listActiveDisruptions>>[number];

/** One stored notice in the shape the habit matcher reads. */
function habitNoticeOf(row: NoticeRow): HabitNotice {
  const lineCodes = stringList(row.lineCodes);
  const stationIds = unique([
    ...(row.stationId ? [row.stationId] : []),
    ...stringList(row.affectedStationIds),
  ]);
  return {
    id: row.id,
    title: row.title,
    lineCodes,
    stationIds,
    scope: noticeScopeOfRow(row, lineCodes, stationIds),
  };
}

/**
 * What a notice is about.
 *
 * The stored scope wins. A row without one is inferred from the ids it
 * carries; a row that names nothing is `unknown`, not network-wide, because
 * an unproven notice must not wake a rider.
 */
function noticeScopeOfRow(
  row: NoticeRow,
  lineCodes: readonly string[],
  stationIds: readonly string[],
): HabitNotice["scope"] {
  if (row.scope === "stop" || row.scope === "line" || row.scope === "network") {
    return row.scope;
  }
  if (stationIds.length > 0) return "stop";
  if (lineCodes.length > 0 || row.lineId !== null || stringList(row.affectedLineIds).length > 0) {
    return "line";
  }
  return "unknown";
}

/** The notice's own validity, from the row, for `isActiveAt`. */
function timelineOf(row: NoticeRow): NoticeTimeline {
  return {
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    validityWindows: validityWindowsOf(row.validityWindows),
  };
}

function validityWindowsOf(value: unknown): ValidityWindow[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is ValidityWindow => {
    if (typeof entry !== "object" || entry === null) return false;
    const window = entry as Partial<ValidityWindow>;
    return (
      typeof window.startsAt === "string" &&
      (window.endsAt === null || typeof window.endsAt === "string")
    );
  });
}

function stringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
