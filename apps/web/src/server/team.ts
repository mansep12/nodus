/**
 * Who may sign for an account besides its owner: backup passkeys of the
 * owner, and clerks who may keep the books but never settle. The chain is
 * the authority; this only keeps the invitations that lead there.
 */
import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { businesses, credentials, invitations } from "@nodus/db";
import { rawPublicKey } from "@nodus/stellar";
import type { InvitationView, Role, TeamView } from "@/lib/types";
import { accountRule, forgetRules } from "./chain";
import { registerCredential, revokeCredential } from "./credentials";
import { getDb } from "./db";
import { UserError } from "./errors";

type Invitation = typeof invitations.$inferSelect;

const INVITATION_DAYS = 7;

const view = (row: Invitation): InvitationView => ({
  id: row.id,
  role: row.role as Role,
  label: row.label,
  status: row.status as InvitationView["status"],
  expiresAt: row.expiresAt.toISOString(),
  credentialId: row.credentialId ?? undefined,
  publicKey: row.publicKey ?? undefined,
});

/** The passkeys and open invitations of `address`. */
export async function team(address: string, currentCredentialId: string): Promise<TeamView> {
  const db = await getDb();
  const [keys, invited] = await Promise.all([
    db.select().from(credentials).where(eq(credentials.address, address)).orderBy(credentials.createdAt),
    db.select().from(invitations).where(eq(invitations.address, address)).orderBy(desc(invitations.createdAt)),
  ]);
  const active = keys.filter((key) => !key.revokedAt);
  // What a key may do is what its rule on chain says, not what the invitation meant.
  const roles = new Map(
    await Promise.all(
      active.map(async (key): Promise<[string, Role]> => {
        const rule = await accountRule(address, key.contextRuleId);
        return [key.credentialId, rule && rule.contextType.kind === "Default" && rule.policies.length === 0 ? "owner" : "clerk"];
      }),
    ),
  );
  return {
    credentials: active.map((key) => ({
      credentialId: key.credentialId,
      label: key.label,
      contextRuleId: key.contextRuleId,
      role: roles.get(key.credentialId) ?? "clerk",
      isPrimary: key.isPrimary,
      createdAt: key.createdAt.toISOString(),
      current: key.credentialId === currentCredentialId,
    })),
    invitations: invited.filter((row) => row.status !== "revoked" && row.expiresAt > new Date()).map(view),
  };
}

/** The owner invites a device or a person to hold a passkey for the account. */
export async function invite(address: string, role: Role, label: string): Promise<InvitationView> {
  const db = await getDb();
  const [row] = await db
    .insert(invitations)
    .values({
      id: randomUUID(),
      address,
      role,
      label: label.slice(0, 40),
      expiresAt: new Date(Date.now() + INVITATION_DAYS * 24 * 60 * 60_000),
    })
    .returning();
  return view(row!);
}

/** What an invitee sees before deciding: whose account, which role. */
export async function describeInvitation(id: string): Promise<InvitationView & { business: string }> {
  const db = await getDb();
  const [row] = await db.select().from(invitations).where(eq(invitations.id, id));
  if (!row || row.status === "revoked") throw new UserError("Esta invitación ya no existe.");
  if (row.expiresAt < new Date()) throw new UserError("Esta invitación venció.");
  const [business] = await db.select().from(businesses).where(eq(businesses.address, row.address));
  return { ...view(row), business: business?.name ?? "Un negocio" };
}

/** The invitee registered a passkey for the invitation: keep its id and public key for the owner to add. */
export async function registerInvitee(id: string, credentialId: string, publicKey: Uint8Array): Promise<InvitationView> {
  const db = await getDb();
  const raw = rawPublicKey(publicKey);
  const [row] = await db
    .update(invitations)
    .set({ credentialId, publicKey: Buffer.from(raw).toString("hex"), status: "registered" })
    .where(and(eq(invitations.id, id), eq(invitations.status, "pending")))
    .returning();
  if (!row) throw new UserError("Esta invitación ya se usó.");
  return view(row);
}

/**
 * The owner added the invitee's passkey to the account under `ruleId`: once
 * the chain confirms it, the passkey can open sessions.
 */
export async function completeInvitation(address: string, id: string, ruleId: number): Promise<InvitationView> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.address, address)));
  if (!row || !row.credentialId || !row.publicKey) throw new UserError("La invitación todavía no tiene una passkey.");
  forgetRules(address);
  await registerCredential({
    address,
    credentialId: row.credentialId,
    publicKey: row.publicKey,
    contextRuleId: ruleId,
    isPrimary: false,
    label: row.label,
  });
  const [updated] = await db.update(invitations).set({ status: "added" }).where(eq(invitations.id, id)).returning();
  return view(updated!);
}

/** The owner withdrew an invitation, or removed the rule its passkey signed under. */
export async function revokeInvitation(address: string, id: string): Promise<void> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(invitations)
    .where(and(eq(invitations.id, id), eq(invitations.address, address)));
  if (!row) throw new UserError("Esta invitación no existe.");
  await db.update(invitations).set({ status: "revoked" }).where(eq(invitations.id, id));
  if (row.credentialId) await revokeCredential(db, row.credentialId);
}

/** A passkey the chain no longer lists is forgotten here too. */
export async function dropCredential(address: string, credentialId: string): Promise<void> {
  const db = await getDb();
  const [key] = await db
    .select()
    .from(credentials)
    .where(and(eq(credentials.credentialId, credentialId), eq(credentials.address, address)));
  if (!key) throw new UserError("Esa passkey no es de esta cuenta.");
  forgetRules(address);
  const rule = await accountRule(address, key.contextRuleId, true);
  const keyData = Buffer.concat([Buffer.from(key.publicKey, "hex"), Buffer.from(key.credentialId, "base64url")]);
  const stillThere = rule?.signers.some((signer) => signer.kind === "External" && signer.keyData.equals(keyData));
  if (stillThere) throw new UserError("La cuenta todavía reconoce esa passkey. Quítala de la cuenta primero.");
  await revokeCredential(db, credentialId);
  await db
    .update(invitations)
    .set({ status: "revoked" })
    .where(and(eq(invitations.address, address), eq(invitations.credentialId, credentialId)));
}
