import { Router, type Request, type Response } from "express";
import { z } from "zod";

import {
  deleteSession,
  deleteUser,
  findSession,
  findUserByEmail,
  insertSession,
  insertUser,
  listMemory,
  MEMORY_KINDS,
  touchSession,
  updatePassword,
  upsertMemory,
} from "@daily-route/db";
import type { AccountSession, MemoryPayload, MemoryWrite } from "@daily-route/db";

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
  SESSION_REFRESH_WITHIN_MS,
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

const passwordSchema = z.string().min(10).max(200);

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
  return emailIssue ? "Enter a valid email." : "Use at least 10 characters.";
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

  /** Resolve the cookie to a live session, refreshing it near its end. */
  const resolveSession = async (
    request: Request,
    response: Response,
  ): Promise<AccountSession | null> => {
    const token = readSessionToken(request.headers.cookie);
    if (token === null) return null;

    const session = await findSession(deps.db, hashSessionToken(token));
    if (session === null) {
      // The cookie names a session the database no longer honours; remove
      // it so the browser stops sending a dead token.
      response.setHeader("Set-Cookie", clearSessionCookie(secure));
      return null;
    }

    const now = Date.now();
    // The expiry slides only near its end. Writing it on every request
    // would turn a read into a write and keep the rider's tab busy.
    if (session.expiresAt.getTime() - now <= SESSION_REFRESH_WITHIN_MS) {
      await touchSession(deps.db, session.id, {
        lastSeenAt: new Date(now),
        expiresAt: new Date(now + SESSION_TTL_MS),
      });
      response.setHeader(
        "Set-Cookie",
        sessionCookie(token, secure, sessionMaxAgeSeconds()),
      );
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

  /** The signed-in user, or null after the response has been refused. */
  const requireSession = async (
    request: Request,
    response: Response,
  ): Promise<AccountSession | null> => {
    const session = await resolveSession(request, response);
    if (session === null) {
      response.status(401).json({ error: SIGN_IN_REQUIRED });
    }
    return session;
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
        error: passwordIssue ? "Use at least 10 characters." : CURRENT_PASSWORD_WRONG,
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

  return router;
}
