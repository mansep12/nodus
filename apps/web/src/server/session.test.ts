import { beforeEach, describe, expect, mock, test } from "bun:test";
import { connect, challenges } from "@nodus/db";
import { AuthError } from "./errors";

process.env.NODUS_SESSION_SECRET = "a secret only these tests know";

const db = await connect();
mock.module("@/server/db", () => ({ getDb: async () => db }));

/** The browser's cookies, as the request handler sees them. */
const jar = new Map<string, string>();
mock.module("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
    delete: (name: string) => void jar.delete(name),
  }),
}));
const { consumeChallenge, endSession, issueChallenge, readSession, requireOwner, requireSession, startSession } = await import("./session");

const OWNER = { address: "CACCOUNT", credentialId: "owner-passkey", ruleId: 0, role: "owner" as const };
const CLERK = { address: "CACCOUNT", credentialId: "clerk-passkey", ruleId: 2, role: "clerk" as const };

beforeEach(async () => {
  jar.clear();
  await db.delete(challenges);
});

describe("challenges", () => {
  test("a nonce that was issued is good once", async () => {
    const nonce = await issueChallenge();

    expect(nonce).toMatch(/^[\w-]{43}$/);
    expect(await consumeChallenge(nonce)).toBe(true);
    expect(await consumeChallenge(nonce)).toBe(false);
  });

  test("every nonce is different", async () => {
    expect(await issueChallenge()).not.toBe(await issueChallenge());
  });

  test("a nonce that was never issued is refused", async () => {
    expect(await consumeChallenge("made-up")).toBe(false);
  });

  test("a nonce issued too long ago is refused", async () => {
    await db.insert(challenges).values({ nonce: "old", createdAt: new Date(Date.now() - 10 * 60_000) });

    expect(await consumeChallenge("old")).toBe(false);
  });
});

describe("sessions", () => {
  test("a session read back says what it was started with", async () => {
    const started = await startSession(OWNER);

    expect(started).toEqual({ ...OWNER, expiresAt: expect.any(Number) });
    expect(started.expiresAt).toBeGreaterThan(Date.now() + 29 * 24 * 60 * 60_000);
    expect(await readSession()).toEqual(started);
  });

  test("there is no session without the cookie or after it ends", async () => {
    expect(await readSession()).toBeNull();
    await expect(requireSession()).rejects.toBeInstanceOf(AuthError);

    await startSession(OWNER);
    await endSession();

    expect(await readSession()).toBeNull();
  });

  test("a cookie that was tampered with is not a session", async () => {
    await startSession(CLERK);
    const [name, value] = [...jar.entries()][0]!;
    const [body, signature] = value.split(".");
    const claims = JSON.parse(Buffer.from(body!, "base64url").toString("utf8"));
    const promoted = Buffer.from(JSON.stringify({ ...claims, role: "owner", ruleId: 0 })).toString("base64url");

    // A clerk promoting itself to owner.
    jar.set(name, `${promoted}.${signature}`);
    expect(await readSession()).toBeNull();
    // The claims as they were, with a signature someone made up.
    jar.set(name, `${body}.${signature!.slice(0, -1)}${signature!.endsWith("A") ? "B" : "A"}`);
    expect(await readSession()).toBeNull();
    // Not even in the shape of one.
    jar.set(name, "not a session");
    expect(await readSession()).toBeNull();
  });

  test("only the owner's session may do what only the owner can", async () => {
    await startSession(CLERK);
    expect(await requireSession()).toMatchObject(CLERK);
    await expect(requireOwner()).rejects.toBeInstanceOf(AuthError);

    await startSession(OWNER);
    expect(await requireOwner()).toMatchObject(OWNER);
  });
});
