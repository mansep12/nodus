/**
 * Gives the demo scripts a passkey of a business made by hand in the app, so
 * that they can sign as it: accept what it owes, register what it is owed and
 * settle circles, without a person approving each one. The business invites a
 * backup device in «Equipo», this script answers the invitation with a passkey
 * of its own, and the owner adds it with «Agregar con passkey».
 *
 *   bun run --filter @nodus/e2e llave <invitation link or id> [app url]
 *
 * The passkey is kept in pitch/out/demo/vecinos.json. Test accounts only.
 */
import type { InvitationView } from "@nodus/api";
import { connectApp } from "./app.ts";
import { log } from "./harness.ts";
import { keptFor } from "./kept.ts";
import { SoftwarePasskey } from "./software-passkey.ts";

const [invitation, url = "http://localhost:3000"] = process.argv.slice(2);
const id = invitation?.split("/").filter(Boolean).pop();
if (!id) throw new Error("Usage: bun run --filter @nodus/e2e llave <invitation link or id> [app url]");

const app = new URL(url);
const { api, enter, readState } = await connectApp(app);
const { mine, remember } = keptFor(url);
const read = () => api<InvitationView & { business: string }>(`/api/invitations/${id}`);

let offer = await read();
if (offer.role !== "owner")
  throw new Error("The invitation is for a clerk, who cannot settle: invite a device instead («Invitar un dispositivo»).");
if (offer.status === "pending") {
  const passkey = new SoftwarePasskey(app.hostname, app.origin);
  const { challenge } = await api<{ challenge: string }>("/api/session/challenge");
  const registration = await passkey.startRegistration({ optionsJSON: { challenge } });
  await api(`/api/invitations/${id}`, {
    registration: {
      id: registration.id,
      response: { clientDataJSON: registration.response.clientDataJSON, publicKey: registration.response.publicKey },
    },
  });
  mine.key = { name: offer.business, passkey: passkey.save() };
  remember();
  log(`Answered the invitation "${offer.label}" of ${offer.business} with a new passkey.`);
} else if (!mine.key) {
  throw new Error("That invitation was already answered with a passkey this script does not have: make a new one.");
}

log("Waiting for the owner: «Equipo» → «Agregar con passkey».");
// The invitation is read under the limit of the directory (120 an hour): every 5 s, for 8 minutes.
for (let asked = 0; offer.status !== "added"; asked++) {
  if (asked > 96) throw new Error("The passkey was not added in 8 minutes. Run this again with the same invitation once it is.");
  await new Promise((resolve) => setTimeout(resolve, 5_000));
  offer = await read();
}

const business = await enter(mine.key!);
const { me } = await readState(business);
if (me.role !== "owner") throw new Error(`The passkey entered as ${me.role}, not as owner.`);
log(`${business.name}: ${business.address} (rule ${business.ruleId}). The scripts can sign for it now.`);
process.exit(0);
