import type { Request, Response } from "express";

import { findSession, touchSession } from "@daily-route/db";
import type { AccountSession } from "@daily-route/db";

import type { ApiDeps } from "./deps.js";
import {
  clearSessionCookie,
  hashSessionToken,
  readSessionToken,
  secureCookie,
  sessionCookie,
  sessionMaxAgeSeconds,
  SESSION_REFRESH_WITHIN_MS,
  SESSION_TTL_MS,
} from "./session-cookie.js";

/**
 * Resolve the cookie to a live session.
 *
 * The lookup is shared by the account router, the plan route and the chat
 * route so all three answer for the same rider. The response is optional
 * because a caller may only need the identity; when it is given, the cookie
 * housekeeping stays here: a dead token is cleared, and a session near its
 * end is slid forward. This function never refuses a request itself — the
 * caller decides whether the absence of a session is a 401 or an anonymous
 * answer.
 */
export async function readAccountSession(
  deps: ApiDeps,
  request: Request,
  response?: Response,
): Promise<AccountSession | null> {
  const token = readSessionToken(request.headers.cookie);
  if (token === null) return null;

  const session = await findSession(deps.db, hashSessionToken(token));
  if (session === null) {
    // The cookie names a session the database no longer honours; remove it
    // so the browser stops sending a dead token.
    if (response) response.setHeader("Set-Cookie", clearSessionCookie(secureCookie(deps.env)));
    return null;
  }

  const now = Date.now();
  // The expiry slides only near its end. Writing it on every request would
  // turn a read into a write and keep the rider's tab busy.
  if (session.expiresAt.getTime() - now <= SESSION_REFRESH_WITHIN_MS) {
    await touchSession(deps.db, session.id, {
      lastSeenAt: new Date(now),
      expiresAt: new Date(now + SESSION_TTL_MS),
    });
    if (response) {
      response.setHeader(
        "Set-Cookie",
        sessionCookie(token, secureCookie(deps.env), sessionMaxAgeSeconds()),
      );
    }
  }

  return session;
}
