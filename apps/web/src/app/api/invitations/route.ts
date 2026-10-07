import { respond, UserError } from "@/server/errors";
import { body, text } from "@/server/input";
import { LIMITS } from "@/server/limits";
import { requireOwner } from "@/server/session";
import { invite } from "@/server/team";

/** The owner invites a backup device or a clerk. */
export async function POST(request: Request) {
  return respond(async () => {
    const session = await requireOwner();
    await LIMITS.writesPerAddress(session.address);
    const input = await body(request);
    const role = input.role;
    if (role !== "owner" && role !== "clerk") throw new UserError("El rol no es válido.");
    return invite(session.address, role, text(input.label, "el nombre", 40).trim());
  });
}
