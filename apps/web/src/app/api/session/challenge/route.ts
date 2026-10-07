import { respond } from "@/server/errors";
import { relyingParty } from "@/server/input";
import { LIMITS, clientIp } from "@/server/limits";
import { issueChallenge } from "@/server/session";

/** A nonce for the passkey to sign, and the relying party it must sign it for. */
export async function GET(request: Request) {
  return respond(async () => {
    await LIMITS.sessionPerIp(clientIp(request));
    return { challenge: await issueChallenge(), rpId: relyingParty(request).rpId };
  });
}
