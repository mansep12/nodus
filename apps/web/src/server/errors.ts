import "server-only";

/** Something the person using the app can understand and act on. */
export class UserError extends Error {}

/** Runs a route handler, turning errors into JSON responses. */
export async function respond<T>(handler: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await handler());
  } catch (error) {
    if (error instanceof UserError) return Response.json({ error: error.message }, { status: 400 });
    console.error(error);
    return Response.json({ error: "Algo falló de nuestro lado. Intenta de nuevo." }, { status: 500 });
  }
}
