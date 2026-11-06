import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

/**
 * Password hashing.
 *
 * scrypt ships with Node, so the account layer needs no dependency and no
 * native build. The cost parameters are stored with every hash: a reader
 * can see the work that went into a row, and a future change can keep
 * verifying the rows written before it.
 *
 * The stored value has the shape
 * `scrypt$<N>$<r>$<p>$<base64url salt>$<base64url key>`.
 */

const ALGORITHM = "scrypt";
/** CPU/memory cost: the number of mixing rounds. */
const COST = 16_384;
/** Block size, in 1 KiB blocks held in memory. */
const BLOCK_SIZE = 8;
/** Lanes: one, because a sign-in is a single password and not a batch. */
const PARALLELISM = 1;
const KEY_BYTES = 32;
const SALT_BYTES = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

const PREFIX = `${ALGORITHM}$${COST}$${BLOCK_SIZE}$${PARALLELISM}$`;

/**
 * The salt and key of a password that cannot exist.
 *
 * Verifying an address that has no account still derives a key, with the
 * same work as a real check, so the response time does not say whether the
 * address is registered. The salt is fixed and no random bytes are drawn
 * on this path: one derivation, never two.
 */
const DUMMY_SALT = Buffer.alloc(SALT_BYTES, 0x5a);
const DUMMY_KEY = Buffer.alloc(KEY_BYTES, 0);
const DUMMY_STORED = `${PREFIX}${DUMMY_SALT.toString("base64url")}$${DUMMY_KEY.toString("base64url")}`;

type StoredHash = { salt: Buffer; key: Buffer };

/** Derive a key with the stored cost parameters. */
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // The callback form keeps the event loop free while the work runs, and
    // it is the form that reports a failure without throwing from a worker.
    scrypt(
      password,
      salt,
      KEY_BYTES,
      { N: COST, r: BLOCK_SIZE, p: PARALLELISM, maxmem: MAX_MEMORY },
      (error, key) => {
        if (error) {
          reject(error);
          return;
        }
        if (!Buffer.isBuffer(key)) {
          reject(new Error("scrypt returned no key"));
          return;
        }
        resolve(key);
      },
    );
  });
}

function parseStoredHash(stored: string): StoredHash | null {
  if (!stored.startsWith(PREFIX)) return null;
  const parts = stored.slice(PREFIX.length).split("$");
  const saltPart = parts[0];
  const keyPart = parts[1];
  if (parts.length !== 2 || saltPart === undefined || keyPart === undefined) return null;

  const salt = Buffer.from(saltPart, "base64url");
  const key = Buffer.from(keyPart, "base64url");
  if (salt.length !== SALT_BYTES || key.length !== KEY_BYTES) return null;
  return { salt, key };
}

/** The same comparison the key check uses, with the length guard. */
function sameKey(candidate: Buffer, expected: Buffer): boolean {
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt);
  return `${PREFIX}${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/**
 * Check a password against a stored hash.
 *
 * A missing user is checked against a fixed dummy hash rather than skipped,
 * so an unknown address and a wrong password take the same time. A stored
 * value this code cannot read is treated the same way.
 */
export async function verifyPassword(password: string, stored: string | null): Promise<boolean> {
  const parsed = parseStoredHash(stored ?? DUMMY_STORED);
  if (parsed === null) {
    // A malformed row still costs one derivation, so a corrupted row and an
    // unknown address are indistinguishable from the outside.
    await derive(password, DUMMY_SALT);
    return false;
  }

  const candidate = await derive(password, parsed.salt);
  const matches = sameKey(candidate, parsed.key);
  // The dummy hash never matches a real password; the answer is no even if
  // the comparison above were to succeed for it.
  return stored !== null && matches;
}
