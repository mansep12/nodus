/**
 * Sessions open with a passkey assertion and live in a signed, HttpOnly
 * cookie. The cookie says which account the browser speaks for and under
 * which of its rules, so that the API can answer for that account only.
 */
import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { cookies } from "next/headers";
import { and, eq, gt } from "drizzle-orm";
import { challenges, credentials } from "@nodus/db";
import { getDb } from "./db";
import { AuthError } from "./errors";

export type Role = "owner" | "clerk";

export interface Session {
  /** The smart account the browser speaks for. */
  address: string;
  /** The passkey it entered with. */
  credentialId: string;
  /** The account's rule the passkey signs under: 0 is the owner's. */
  ruleId: number;
  role: Role;
  expiresAt: number;
}

const COOKIE = "nodus_session";
const SESSION_MS = 30 * 24 * 60 * 60_000;
const CHALLENGE_MS = 5 * 60_000;

let cachedSecret: Buffer | undefined;

/**
 * The key the cookies are signed with: NODUS_SESSION_SECRET, or in development
 * a key kept next to the embedded database so that sessions survive restarts.
 */
function secret(): Buffer {
  if (cachedSecret) return cachedSecret;
  const fromEnv = process.env.NODUS_SESSION_SECRET;
  if (fromEnv) return (cachedSecret = Buffer.from(fromEnv, "utf8"));
  if (process.env.NODE_ENV === "production") throw new Error("NODUS_SESSION_SECRET is not set");
  const dir = path.join(process.cwd(), process.env.NODUS_DATA_DIR || ".data");
  const file = path.join(dir, "session-secret");
  if (!existsSync(file)) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, randomBytes(32).toString("base64url"), { mode: 0o600 });
  }
  return (cachedSecret = Buffer.from(readFileSync(file, "utf8").trim(), "utf8"));
}

const sign = (body: string) => createHmac("sha256", secret()).update(body).digest("base64url");

function encode(session: Session): string {
  const body = Buffer.from(JSON.stringify(session)).toString("base64url");
  return `${body}.${sign(body)}`;
}

function decode(token: string | undefined): Session | null {
  if (!token) return null;
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const session = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Session;
    return session.expiresAt > Date.now() ? session : null;
  } catch {
    return null;
  }
}

/** The session of the request, if it has a valid one. */
export async function readSession(): Promise<Session | null> {
  return decode((await cookies()).get(COOKIE)?.value);
}

/** The session of the request; refuses the request without one, or with a passkey the account let go of. */
export async function requireSession(): Promise<Session> {
  const session = await readSession();
  if (!session) throw new AuthError("Entra con tu passkey para seguir.");
  const db = await getDb();
  const [credential] = await db
    .select({ revokedAt: credentials.revokedAt, address: credentials.address })
    .from(credentials)
    .where(eq(credentials.credentialId, session.credentialId));
  if (credential && (credential.revokedAt || credential.address !== session.address)) {
    throw new AuthError("Esta passkey ya no firma por la cuenta. Entra de nuevo.");
  }
  return session;
}

/** A session that may do everything the account can, not only what a clerk may. */
export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "owner") throw new AuthError("Solo el dueño de la cuenta puede hacer esto.");
  return session;
}

export async function startSession(claims: Omit<Session, "expiresAt">): Promise<Session> {
  const session = { ...claims, expiresAt: Date.now() + SESSION_MS };
  (await cookies()).set(COOKIE, encode(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MS / 1000,
  });
  return session;
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** A nonce for a passkey assertion, good once and for a few minutes. */
export async function issueChallenge(): Promise<string> {
  const db = await getDb();
  const nonce = randomBytes(32).toString("base64url");
  await db.insert(challenges).values({ nonce });
  return nonce;
}

/** Spends the nonce; false if it was never issued, already used or too old. */
export async function consumeChallenge(nonce: string): Promise<boolean> {
  const db = await getDb();
  const spent = await db
    .delete(challenges)
    .where(and(eq(challenges.nonce, nonce), gt(challenges.createdAt, new Date(Date.now() - CHALLENGE_MS))))
    .returning({ nonce: challenges.nonce });
  return spent.length === 1;
}
