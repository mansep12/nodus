import "server-only";

/** Something the person using the app can understand and act on. */
export class UserError extends Error {}

/** The request needs a session, or the session cannot do this. */
export class AuthError extends UserError {}

/** The caller has done this too often; `retryAt` says when it may try again. */
export class RateLimited extends UserError {
  constructor(public readonly retryAt: Date) {
    super("Demasiados intentos seguidos. Espera un momento y vuelve a intentarlo.");
  }
}

/** Runs a route handler, turning errors into JSON responses. */
export async function respond<T>(handler: () => Promise<T>): Promise<Response> {
  try {
    const result = await handler();
    return result instanceof Response ? result : Response.json(result);
  } catch (error) {
    if (error instanceof RateLimited) {
      const seconds = Math.max(1, Math.ceil((error.retryAt.getTime() - Date.now()) / 1000));
      return Response.json({ error: error.message }, { status: 429, headers: { "Retry-After": String(seconds) } });
    }
    if (error instanceof AuthError) return Response.json({ error: error.message }, { status: 401 });
    if (error instanceof UserError) return Response.json({ error: error.message }, { status: 400 });
    console.error(error);
    return Response.json({ error: "Algo falló de nuestro lado. Intenta de nuevo." }, { status: 500 });
  }
}
