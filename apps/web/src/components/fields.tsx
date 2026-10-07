"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { get } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import type { DirectoryMatch } from "@/lib/types";
import { useToast } from "./overlays";
import { Avatar, Button } from "./ui";

/** A label over a field, the way every form in the app writes them. */
export function Field({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

/** Puts `text` on the clipboard and says so. */
export function CopyButton({
  text,
  label = "Copiar",
  copied = "Copiado",
  className = "",
}: {
  text: string;
  label?: string;
  copied?: string;
  className?: string;
}) {
  const notify = useToast();
  return (
    <Button
      variant="quiet"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          notify(copied);
        } catch {
          notify("No se pudo copiar. Selecciónalo y cópialo a mano.", "problem");
        }
      }}
    >
      {label}
    </Button>
  );
}

interface PickBusinessProps {
  value: DirectoryMatch | null;
  onChange: (business: DirectoryMatch | null) => void;
  /** The business filling the form, left out of the results. */
  me: string;
  /** Businesses already known, offered before typing. */
  known: DirectoryMatch[];
}

const isAddress = (text: string) => /^C[A-Z2-7]{55}$/.test(text.trim());

/**
 * Finds the other business of a debt: by a piece of its name among those in
 * Nodus, or exactly by its address, which is how a business that is not in
 * the directory yet can still be named.
 */
export function PickBusiness({ value, onChange, me, known }: PickBusinessProps) {
  const listId = useId();
  const [query, setQuery] = useState("");
  /** What the directory answered, and for which text, so that stale answers are ignored. */
  const [answer, setAnswer] = useState<{ text: string; matches: DirectoryMatch[] }>({ text: "", matches: [] });
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const text = query.trim();
  const matches = answer.text === text ? answer.matches : [];
  const searching = text.length >= 2 && answer.text !== text;

  useEffect(() => {
    if (text.length < 2) return;
    let live = true;
    const timer = setTimeout(async () => {
      let found: DirectoryMatch[];
      try {
        found = await get<DirectoryMatch[]>(
          isAddress(text) ? `/api/businesses?address=${text}` : `/api/businesses?q=${encodeURIComponent(text)}`,
        );
      } catch {
        found = [];
      }
      if (!live) return;
      const matched =
        isAddress(text) && found.length === 0 ? [{ address: text, name: shortAddress(text) }] : found.filter((m) => m.address !== me);
      setAnswer({ text, matches: matched });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [text, me]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => !box.current?.contains(event.target as Node) && setOpen(false);
    window.addEventListener("pointerdown", onPointer);
    return () => window.removeEventListener("pointerdown", onPointer);
  }, []);

  const choices = text.length < 2 ? known.filter((b) => b.address !== me).slice(0, 6) : matches;

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-hairline-strong bg-card px-3 py-2">
        <Avatar name={value.name} size="sm" tone="credit" />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{value.name}</span>
          <span className="block font-mono text-tiny text-muted">{shortAddress(value.address)}</span>
        </span>
        <Button variant="quiet" onClick={() => onChange(null)}>
          Cambiar
        </Button>
      </div>
    );
  }

  return (
    <div ref={box} className="relative">
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Nombre del negocio o dirección C…"
        autoComplete="off"
        className="field w-full"
      />
      {open && (choices.length > 0 || text.length >= 2) && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-xl border border-hairline bg-card py-1 shadow-lift"
        >
          {choices.map((business) => (
            <li key={business.address}>
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  onChange(business);
                  setQuery("");
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas-soft focus-visible:bg-canvas-soft"
              >
                <Avatar name={business.name} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{business.name}</span>
                  <span className="block font-mono text-tiny text-muted">{shortAddress(business.address)}</span>
                </span>
              </button>
            </li>
          ))}
          {choices.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">
              {searching ? "Buscando…" : "Ningún negocio con ese nombre. Si tienes su dirección, pégala aquí."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
