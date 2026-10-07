"use client";

import { Button, Knot, Problem } from "@/components/ui";

/** What the app shows when a page throws: what happened, in plain words, and a way back. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <Knot className="size-9 text-ink" strokeWidth={1.5} />
        <p className="display text-3xl">Algo falló de nuestro lado.</p>
        <p className="text-body">Nada se firmó ni se envió. Puedes volver a intentarlo; si sigue pasando, recarga la página.</p>
        {error.digest && <Problem>Referencia del error: {error.digest}</Problem>}
        <Button onClick={reset}>Intentar de nuevo</Button>
      </div>
    </main>
  );
}
