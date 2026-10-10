import { beforeEach, describe, expect, mock, test } from "bun:test";
import { createPrivateKey, generateKeyPairSync } from "node:crypto";
import { and, ilike } from "drizzle-orm";
import { businesses, connect, credentials, exampleActors, exampleWorlds } from "@nodus/db";
import type * as Examples from "./examples";

process.env.NODUS_SESSION_SECRET = "a secret only these tests know";

const db = await connect();
// Bun fixes the shape of a mocked module the first time it loads: every stand-in for the database offers the same names.
mock.module("@/server/db", () => ({ getDb: async () => db, refresh: async () => {} }));
// Handing worlds out never reaches the network; what the neighbours do on it is covered by the scripts that drive the app.
mock.module("@/server/chain", () => ({
  nodus: {},
  server: {},
  accountRule: async () => undefined,
  isOwnerRule: () => false,
  passkeySigners: () => [],
  tokenBalance: async () => 0n,
  latestLedger: async () => 1_000,
  forgetBalances: () => {},
  forgetRules: () => {},
  isSmartAccount: async () => false,
}));
mock.module("@/server/faucet", () => ({ FAUCET_AMOUNT: 0n, hasFaucet: () => false, mintTestTokens: async () => "" }));
const { addWorld, claimWorld, directoryScope, isExampleBusiness, worldCounts } = (await import("./examples")) as typeof Examples;

let made = 0;
/** An account with a passkey the app already knows, as the script that makes the worlds leaves it. */
async function account(name: string, part?: string) {
  const address = `C${name.toUpperCase().replace(/[^A-Z]/g, "")}${made++}`;
  const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const passkey = {
    credentialId: `credential-of-${address}`,
    privateKey: pair.privateKey.export({ type: "pkcs8", format: "der" }).toString("base64"),
    publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64"),
  };
  await db.insert(credentials).values({ credentialId: passkey.credentialId, address, publicKey: "04", isPrimary: true });
  await db.insert(businesses).values({ address, name });
  return { address, part, passkey };
}

async function world() {
  const business = await account("Panadería Sur");
  const neighbors = [await account("Molino Andes", "mill"), await account("Fletes Ruta 5", "carrier")];
  const { id } = await addWorld({ business, neighbors });
  return { id, business, neighbors };
}

beforeEach(async () => {
  await db.delete(exampleWorlds);
  await db.delete(credentials);
  await db.delete(businesses);
});

describe("addWorld", () => {
  test("takes a world in, and keeps its passkeys where only the installation can read them", async () => {
    const { business } = await world();

    expect(await worldCounts()).toEqual({ waiting: 1, claimed: 0 });
    expect(await isExampleBusiness(business.address)).toBe(true);
    const kept = await db.select().from(exampleActors);
    expect(kept).toHaveLength(3);
    for (const actor of kept) expect(actor.sealedPasskey).not.toContain(business.passkey.privateKey.slice(0, 24));
  });

  test("refuses an account the app does not know by the passkey given for it", async () => {
    const business = await account("Panadería Sur");
    const stranger = { ...(await account("Molino Andes", "mill")), address: "CSOMEONEELSE" };

    await expect(addWorld({ business, neighbors: [stranger] })).rejects.toThrow(/no responde a la passkey/);
    expect(await worldCounts()).toEqual({ waiting: 0, claimed: 0 });
  });
});

describe("claimWorld", () => {
  test("hands each visitor a world of their own, with the passkey of its business", async () => {
    const [first, second] = [await world(), await world()];

    const entries = [await claimWorld(), await claimWorld()];

    expect(entries.map((entry) => entry.address).sort()).toEqual([first.business.address, second.business.address].sort());
    expect(await worldCounts()).toEqual({ waiting: 0, claimed: 2 });
    const entry = entries.find((each) => each.address === first.business.address)!;
    expect(entry.name).toBe("Panadería Sur");
    expect(entry.credentialId).toBe(first.business.passkey.credentialId);
    const original = createPrivateKey({ key: Buffer.from(first.business.passkey.privateKey, "base64"), format: "der", type: "pkcs8" });
    expect(entry.privateKey).toEqual(original.export({ format: "jwk" }) as JsonWebKey);
  });

  test("gives again the world handed out longest ago when none is left", async () => {
    await world();
    await world();
    const first = await claimWorld();
    await claimWorld();

    expect((await claimWorld()).address).toBe(first.address);
  });

  test("says so when there is no world at all", async () => {
    await expect(claimWorld()).rejects.toThrow(/no hay negocios de ejemplo/);
  });
});

describe("directoryScope", () => {
  const found = async (asking: string) => {
    const rows = await db
      .select()
      .from(businesses)
      .where(and(ilike(businesses.name, "%molino%"), await directoryScope(asking)));
    return rows.map((row) => row.address);
  };

  test("an example business finds only the neighbours of its own world, and everyone else none of them", async () => {
    const [mine, other] = [await world(), await world()];
    await db.insert(businesses).values({ address: "CREALMILL", name: "Molino de verdad" });

    expect(await found(mine.business.address)).toEqual([mine.neighbors[0]!.address]);
    expect(await found(other.business.address)).toEqual([other.neighbors[0]!.address]);
    expect(await found("CREALBAKERY")).toEqual(["CREALMILL"]);
  });
});
