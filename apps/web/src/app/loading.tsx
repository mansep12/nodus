import { Knot } from "@/components/ui";

export default function Loading() {
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <div className="flex flex-col items-center gap-4 text-muted">
        <Knot className="size-9 animate-pulse text-ink" strokeWidth={1.5} />
        Abriendo Nodus…
      </div>
    </main>
  );
}
