"use client";

import { AnimatePresence, motion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { EASE } from "@/lib/motion";
import { Button, Tick } from "./ui";

/*
 * What floats over a page: a sheet for a task, a dialog for a question, and
 * toasts for what just happened. They follow DESIGN.md like the rest of
 * `ui.tsx`; screens compose them and never restyle them.
 */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** A line under the title about what the sheet is for. */
  description?: ReactNode;
  children: ReactNode;
}

/** A task that deserves the whole screen for a moment: it slides up on a phone and in from the side on a desk. */
export function Sheet({ open, onClose, title, description, children }: SheetProps) {
  const titleId = useId();
  useEscape(open, onClose);
  useLockedScroll(open);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-stretch sm:justify-end">
          <motion.button
            type="button"
            aria-label="Cerrar"
            onClick={onClose}
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-card shadow-lift sm:h-full sm:max-h-none sm:w-[min(520px,100%)] sm:rounded-none sm:border-l sm:border-hairline"
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
          >
            <header className="flex items-start justify-between gap-6 border-b border-hairline px-6 pb-5 pt-6 sm:px-8">
              <div>
                <h2 id={titleId} className="display text-3xl">
                  {title}
                </h2>
                {description && <p className="mt-2 text-sm text-body">{description}</p>}
              </div>
              <Button variant="quiet" onClick={onClose} aria-label="Cerrar">
                Cerrar
              </Button>
            </header>
            <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">{children}</div>
          </motion.section>
        </div>
      )}
    </AnimatePresence>
  );
}

interface ConfirmProps {
  open: boolean;
  title: ReactNode;
  children: ReactNode;
  /** What the confirming button says. */
  action: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** A question before something that cannot be undone. */
export function Confirm({ open, title, children, action, busy, onConfirm, onCancel }: ConfirmProps) {
  const titleId = useId();
  useEscape(open && !busy, onCancel);
  useLockedScroll(open);
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center px-5">
          <motion.button
            type="button"
            aria-label="Cerrar"
            onClick={busy ? undefined : onCancel}
            className="absolute inset-0 bg-ink/30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="relative w-full max-w-md rounded-3xl border border-hairline bg-card p-7 shadow-lift"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <h2 id={titleId} className="display text-2xl">
              {title}
            </h2>
            <div className="mt-3 text-sm text-body">{children}</div>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="outline" onClick={onCancel} disabled={busy}>
                Volver
              </Button>
              <Button onClick={onConfirm} busy={busy} autoFocus>
                {action}
              </Button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onEscape();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, onEscape]);
}

function useLockedScroll(locked: boolean) {
  useEffect(() => {
    if (!locked) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [locked]);
}

interface Toast {
  id: number;
  message: ReactNode;
  tone: "done" | "problem";
}

const ToastContext = createContext<{ notify: (message: ReactNode, tone?: Toast["tone"]) => void } | null>(null);

const TOAST_MS = 4_500;

/** Keeps the toasts of the app and shows them at the bottom of the screen. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);
  const notify = useCallback((message: ReactNode, tone: Toast["tone"] = "done") => {
    const id = next.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), TOAST_MS);
  }, []);
  const value = useMemo(() => ({ notify }), [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex flex-col items-center gap-2 px-5">
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.p
              key={toast.id}
              role="status"
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 8, opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              className={`pointer-events-auto flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm shadow-lift ${
                toast.tone === "problem" ? "border-error/20 bg-card text-error-deep" : "border-hairline bg-ink text-white"
              }`}
            >
              {toast.tone === "done" && <Tick className="size-3.5 shrink-0 stroke-free" />}
              {toast.message}
            </motion.p>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/** Says, briefly, that something happened: a debt registered, a link copied. */
export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast needs a ToastProvider");
  return value.notify;
}
