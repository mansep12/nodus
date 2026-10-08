import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { FOCUS, SCENARIOS } from "@/lib/fixtures";
import type { StateView } from "@/lib/types";

// Accepting needs a passkey and the network; here it only succeeds.
const acceptDebt = mock<(id: bigint) => Promise<void>>(async () => {});
mock.module("@/lib/actions", () => ({
  registerDebt: async () => 0n,
  acceptDebt,
  rejectDebt: async () => {},
  cancelDebt: async () => {},
  payDebt: async () => {},
  signCircle: async () => {},
  explain: (error: unknown) => String(error),
}));
// The state a test hands over is the one that counts, not the one read back after acting.
mock.module("@/lib/api", () => ({
  SessionLost: class SessionLost extends Error {},
  fetchState: async () => undefined,
  get: async () => ({}),
  post: async () => ({}),
  del: async () => ({}),
}));
mock.module("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
const { InboxView } = await import("./inbox-view");
const { ToastProvider } = await import("./overlays");
const { NodusProvider } = await import("@/lib/nodus");

const client = new QueryClient();
const leave = () => {};
const inbox = (state: StateView) => (
  <QueryClientProvider client={client}>
    <ToastProvider>
      <NodusProvider state={state} leave={leave}>
        <InboxView />
      </NodusProvider>
    </ToastProvider>
  </QueryClientProvider>
);

/** The headlines of the circles under the group called `title`, in the order they are shown. */
function circlesUnder(container: HTMLElement, title: string): string[] {
  const group = [...container.querySelectorAll("section")].find((section) => section.querySelector("h2")?.textContent?.startsWith(title));
  return [...(group?.querySelectorAll("article h3") ?? [])].map((headline) => headline.textContent!.replace(/USDC.*/, ""));
}

afterEach(() => {
  cleanup();
  acceptDebt.mockClear();
});

describe("InboxView", () => {
  test("keeps a debt for a moment after it is accepted, saying so, and then lets it go", async () => {
    const before = SCENARIOS.completa.build();
    const { container, rerender } = render(inbox(before));
    expect(container.querySelector("h1")!.textContent).toBe("2 círculos y 1 deuda esperan tu firma.");

    fireEvent.click(screen.getByRole("button", { name: "Aceptar con passkey" }));
    await waitFor(() => expect(container.textContent).toContain("Aceptada"));
    expect(acceptDebt).toHaveBeenCalledTimes(1);

    // The state comes back without the debt among the pending ones, as it does once the chain has it.
    const pending = before.obligations.find((obligation) => obligation.debtor === FOCUS.address && obligation.status === "pending")!;
    rerender(
      inbox({
        ...before,
        obligations: before.obligations.map((obligation) => (obligation === pending ? { ...pending, status: "accepted" } : obligation)),
      }),
    );

    expect(container.querySelector("h1")!.textContent).toBe("2 círculos esperan tu firma.");
    expect(container.textContent).toContain("Imprenta Bellavista registró que le debes");
    expect(container.textContent).toContain("Deuda aceptada. Ya puede entrar en un círculo");

    await waitFor(() => expect(container.textContent).not.toContain("Deudas por aceptar"), { timeout: 4_000 });
    expect(container.textContent).not.toContain("Imprenta Bellavista registró");
  });

  test("leaves a circle where it was while something happens to it, and moves it afterwards", async () => {
    const { container, rerender } = render(inbox(SCENARIOS.completa.build()));
    expect(circlesUnder(container, "Círculos por firmar")).toEqual(["Se cancelan 870", "Se cancelan 270"]);
    expect(circlesUnder(container, "En curso")).toEqual(["Se cancelan 1.440"]);

    // The business signs both: one is sent to the network, the other waits for the rest.
    rerender(inbox(SCENARIOS.liquidando.build()));
    expect(container.querySelector("h1")!.textContent).toBe("1 deuda espera tu firma.");
    expect(circlesUnder(container, "Círculos por firmar")).toEqual(["Se cancelan 870", "Se cancelan 270"]);

    // The one that waits moves on after its moment; the one being sent stays until it is settled.
    await waitFor(() => expect(circlesUnder(container, "En curso")).toEqual(["Se cancelan 1.440", "Se cancelan 270"]), { timeout: 4_000 });
    await waitFor(() => expect(circlesUnder(container, "Círculos por firmar")).toEqual(["Se cancelan 870"]));

    rerender(inbox(SCENARIOS.firmada.build()));
    expect(circlesUnder(container, "Círculos por firmar")).toEqual(["Se cancelaron 870"]);
    expect(circlesUnder(container, "Recién desanudados")).toEqual([]);
  });
});
