import Link from "next/link";
import { Knot } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex max-w-md flex-col items-center gap-5 text-center">
        <Knot className="size-9 text-ink" strokeWidth={1.5} />
        <p className="display text-3xl">Esta página no existe.</p>
        <p className="text-body">Puede que el enlace esté mal escrito o que la página se haya movido.</p>
        <Link href="/" className="font-medium underline underline-offset-4">
          Ir al inicio
        </Link>
      </div>
    </main>
  );
}
