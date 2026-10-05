import { StrKey } from "@stellar/stellar-sdk";
import { refresh } from "@/server/db";
import { respond } from "@/server/errors";
import { getState } from "@/server/state";

/** Everything the app shows. `fresh=1` reads the chain first, for right after a transaction. */
export async function GET(request: Request) {
  return respond(async () => {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get("address");
    if (searchParams.get("fresh") === "1") await refresh(true);
    return getState(address && StrKey.isValidContract(address) ? address : null);
  });
}
