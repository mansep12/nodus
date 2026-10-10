import { respond } from "@/server/errors";
import { claimWorld } from "@/server/examples";
import { LIMITS, clientIp } from "@/server/limits";

/**
 * Hands the visitor an example business of their own to try the app with:
 * its test passkey, which the browser keeps and enters with. A business that
 * does not exist, on the test network, whose neighbours the server answers for.
 */
export async function POST(request: Request) {
  return respond(async () => {
    // Asked for with JSON, which a form on another site cannot send without the browser asking first.
    if (!/^application\/json\b/i.test(request.headers.get("content-type") ?? ""))
      return Response.json({ error: "La solicitud no es válida." }, { status: 400 });
    await LIMITS.examplesPerIp(clientIp(request));
    return claimWorld();
  });
}
