import { respond, UserError } from "@/server/errors";
import { body } from "@/server/input";
import { requestSignature } from "@/server/proposals";
import { requireOwner } from "@/server/session";

/** What the business of the session must sign to settle `clearings`. Starts the proposal if nobody has. */
export async function POST(request: Request) {
  return respond(async () => {
    const session = await requireOwner();
    const input = await body(request);
    if (!Array.isArray(input.clearings) || input.clearings.length > 200) throw new UserError("Faltan las deudas del círculo.");
    const clearings = input.clearings.map((clearing: { id?: unknown; amount?: unknown }) => {
      if (!/^\d{1,20}$/.test(String(clearing?.id)) || !/^\d{1,39}$/.test(String(clearing?.amount))) {
        throw new UserError("Las deudas del círculo no son válidas.");
      }
      return { id: BigInt(String(clearing.id)), amount: BigInt(String(clearing.amount)) };
    });
    return requestSignature(clearings, session.address);
  });
}
