import { createHash, randomBytes } from "node:crypto";

import type { Env } from "@daily-route/env";

/**
 * The session cookie.
 *
 * The browser keeps a random token; the database keeps only its SHA-256,
 * so a snapshot of the sessions table does not hand out live sessions. The
 * cookie is `HttpOnly` and `SameSite=Lax`, which keeps it away from scripts
 * and from a cross-site form post, and it carries no `Domain` attribute so
 * the browser sends it back to this origin only.
 */

export const SESSION_COOKIE_NAME = "dr_session";

/** A session lasts thirty days from its last refresh. */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;

/** The expiry only moves once the session is this close to its end. */
export const SESSION_REFRESH_WITHIN_MS = 15 * 24 * 60 * 60_000;

const SESSION_TTL_SECONDS = SESSION_TTL_MS / 1_000;
const TOKEN_BYTES = 32;

/** A new cookie value: 32 random bytes, written base64url. */
export function newSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

/** What the database stores for a token. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * The Set-Cookie value that starts or continues a session.
 *
 * `Secure` is added only when the deployment is https; a development
 * server on http would otherwise never receive the cookie back.
 */
export function sessionCookie(token: string, secure: boolean, maxAgeSeconds: number): string {
  const flags = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
  return `${SESSION_COOKIE_NAME}=${token}; ${flags}`;
}

/** The Set-Cookie value that removes the cookie from the browser. */
export function clearSessionCookie(secure: boolean): string {
  const flags = `HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure ? "; Secure" : ""}`;
  return `${SESSION_COOKIE_NAME}=; ${flags}`;
}

/**
 * The session token of a request, or null when it carries none.
 *
 * A Cookie header is a semicolon-separated list of `name=value` pairs; a
 * value may contain `=` as well, so only the first one separates the name.
 */
export function readSessionToken(cookieHeader: string | undefined): string | null {
  if (cookieHeader === undefined) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== SESSION_COOKIE_NAME) continue;
    const value = part.slice(separator + 1).trim();
    return value.length > 0 ? value : null;
  }
  return null;
}

/** Whether the cookie may carry `Secure`: only a production deployment is https. */
export function secureCookie(env: Env): boolean {
  return env.NODE_ENV === "production";
}

/** The Max-Age of a freshly issued session. */
export function sessionMaxAgeSeconds(): number {
  return SESSION_TTL_SECONDS;
}
