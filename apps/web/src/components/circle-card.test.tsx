import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { CircleView, SettlementOption } from "@/lib/types";

// Signing needs a passkey and the network; here we only watch what gets signed.
const signCircle = mock<(circle: CircleView, me: string) => Promise<void>>(async () => {});
mock.module("@/lib/actions", () => ({
  registerDebt: async () => 0n,
  acceptDebt: async () => {},
  rejectDebt: async () => {},
  cancelDebt: async () => {},
  payDebt: async () => {},
  signCircle,
  explain: (error: unknown) => String(error),
}));
mock.module("@/lib/api", () => ({
  SessionLost: class SessionLost extends Error {},
  fetchState: async () => ({}),
  get: async () => ({}),
  post: async () => ({}),
  del: async () => ({}),
}));
const { CircleCard, inWords } = await import("./circle-card");
const { History } = await import("./history");
const { ToastProvider } = await import("./overlays");

const [BAKERY, MILL, CARRIER] = ["bakery", "mill", "carrier"];
const NAMES: Record<string, string> = { bakery: "Panadería Sur", mill: "Molino Andes", carrier: "Fletes Ruta 5" };
const nameOf = (address: string) => NAMES[address]!;
const units = (amount: number) => (BigInt(amount) * 10_000_000n).toString();

/** The circle bakery → mill → carrier → bakery, cancelling the given amount of each debt. */
function option(key: string, [toMill, toCarrier, toBakery]: [number, number, number], signed: string[] = []): SettlementOption {
  const party = (address: string, owesLess: number, owedLess: number) => ({
    address,
    known: true,
    owesLess: units(owesLess),
    owedLess: units(owedLess),
    net: (BigInt(units(owedLess)) - BigInt(units(owesLess))).toString(),
    signed: signed.includes(address),
  });
  const parties = [party(BAKERY, toMill, toBakery), party(MILL, toCarrier, toMill), party(CARRIER, toBakery, toCarrier)];
  return {
    key,
    clearings: [toMill, toCarrier, toBakery].map((amount, id) => ({ id: String(id), amount: units(amount) })),
    parties,
    edges: [
      { from: BAKERY, to: MILL, amount: units(toMill) },
      { from: MILL, to: CARRIER, amount: units(toCarrier) },
      { from: CARRIER, to: BAKERY, amount: units(toBakery) },
    ],
    cleared: units(toMill + toCarrier + toBakery),
    moved: parties.reduce((sum, p) => (BigInt(p.net) > 0n ? sum + BigInt(p.net) : sum), 0n).toString(),
  };
}

const detected: CircleView = { ...option("full", [100, 80, 90]), netOnly: option("net", [80, 80, 80]) };

function show(ui: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

const headline = (container: HTMLElement) => container.querySelector("h3")!.textContent;

afterEach(() => {
  cleanup();
  signCircle.mockClear();
});

describe("CircleCard", () => {
  test("settles in full unless the party chooses to move no money, and signs what is on screen", async () => {
    const { container } = show(<CircleCard circle={detected} me={BAKERY} nameOf={nameOf} balance={BigInt(units(50))} />);

    expect(headline(container)).toBe("Se cancelan 270USDC moviendo solo 20USDC.");
    expect(container.querySelector("dl")!.textContent).toBe("Dejas de deber100Dejan de deberte90Pagas10");

    fireEvent.click(screen.getByRole("radio", { name: "Sin mover dinero" }));

    expect(headline(container)).toBe("Se cancelan 240USDC sin mover dinero.");
    expect(container.querySelector("dl")!.textContent).toBe("Dejas de deber80Dejan de deberte80Pagas0");

    fireEvent.click(screen.getByRole("button", { name: "Firmar con passkey" }));
    await waitFor(() => expect(signCircle).toHaveBeenCalledTimes(1));
    const [signedCircle, signer] = signCircle.mock.calls[0]!;
    expect(signedCircle.key).toBe("net");
    expect(signedCircle.clearings).toEqual(detected.netOnly!.clearings);
    expect(signer).toBe(BAKERY);
  });

  test("stops a party that cannot pay its net and points it to settling without money", () => {
    show(<CircleCard circle={detected} me={BAKERY} nameOf={nameOf} balance={BigInt(units(4))} />);

    const signButton = screen.getByRole<HTMLButtonElement>("button", { name: "Firmar con passkey" });
    expect(signButton.disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toBe("Te faltan 6 USDC para pagar tu saldo neto. Puedes compensar sin mover dinero.");

    fireEvent.click(screen.getByRole("radio", { name: "Sin mover dinero" }));

    expect(signButton.disabled).toBe(false);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("offers no choice when the circle already moves no money", () => {
    show(<CircleCard circle={option("even", [70, 70, 70])} me={MILL} nameOf={nameOf} />);

    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("button", { name: "Firmar con passkey" })).toBeDefined();
  });

  test("once signing has started, shows who is missing and how long is left", () => {
    const signing: CircleView = {
      ...option("full", [100, 80, 90], [BAKERY]),
      proposal: { id: "p1", status: "open", expirationLedger: 1_000 + 17_280 },
    };
    const { container } = show(<CircleCard circle={signing} me={BAKERY} nameOf={nameOf} ledger={1_000} />);

    expect(container.textContent).toContain("Firmando · 1 de 3");
    expect(container.textContent).toContain("Ya firmaste. Faltan las firmas de Molino Andes y Fletes Ruta 5.");
    expect(container.textContent).toContain("Quedan cerca de 24 horas para reunir las firmas.");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: "Firmar con passkey" })).toBeNull();
  });

  test("lets a party that has not signed yet join the proposal under way", async () => {
    const signing: CircleView = {
      ...option("full", [100, 80, 90], [BAKERY]),
      proposal: { id: "p1", status: "open", expirationLedger: 2_000 },
    };
    show(<CircleCard circle={signing} me={MILL} nameOf={nameOf} />);

    fireEvent.click(screen.getByRole("button", { name: "Firmar con passkey" }));

    await waitFor(() => expect(signCircle).toHaveBeenCalledTimes(1));
    expect(signCircle.mock.calls[0]![0].key).toBe("full");
  });

  test("says why the last attempt failed and lets the parties try again", () => {
    const retry: CircleView = {
      ...detected,
      proposal: { id: "p0", status: "failed", expirationLedger: 0, error: "El plazo para firmar venció." },
    };
    show(<CircleCard circle={retry} me={CARRIER} nameOf={nameOf} balance={BigInt(units(50))} />);

    expect(screen.getByRole("alert").textContent).toBe("El intento anterior no se completó: El plazo para firmar venció.");
    expect(screen.getByRole("radiogroup")).toBeDefined();
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Firmar con passkey" }).disabled).toBe(false);
  });

  test("shows a settled circle with the transaction that proves it", () => {
    const settled: CircleView = {
      ...option("full", [100, 80, 90], [BAKERY, MILL, CARRIER]),
      proposal: { id: "p1", status: "settled", expirationLedger: 0, txHash: "abc123" },
    };
    const { container } = show(<CircleCard circle={settled} me={MILL} nameOf={nameOf} />);

    expect(headline(container)).toBe("Se cancelaron 270USDC moviendo solo 20USDC.");
    expect(container.querySelector("dl")!.textContent).toBe("Dejaste de deber80Dejaron de deberte100Recibiste20");
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: "Ver la transacción en la red" }).href).toEndWith("/tx/abc123");
    expect(screen.queryByRole("button", { name: "Firmar con passkey" })).toBeNull();
  });

  test("says how far the settlement has got once every party has signed", () => {
    const sent: CircleView = {
      ...option("full", [100, 80, 90], [BAKERY, MILL, CARRIER]),
      proposal: { id: "p1", status: "submitted", expirationLedger: 0 },
    };
    const { container } = show(<CircleCard circle={sent} me={MILL} nameOf={nameOf} />);

    const steps = [...container.querySelectorAll("ol li")].map((step) => step.textContent);
    expect(steps).toEqual(["Firmas completas (listo)", "Enviando a la red…", "Confirmada en la red"]);
    expect(container.querySelector('[aria-current="step"]')!.textContent).toBe("Enviando a la red…");
    expect(container.textContent).toContain("Liquidando…");
    expect(screen.queryByRole("button", { name: "Firmar con passkey" })).toBeNull();
  });

  test("keeps the receipt of a settled circle at hand where its settlement is known", () => {
    const settled: CircleView = {
      ...option("full", [100, 80, 90], [BAKERY, MILL, CARRIER]),
      proposal: { id: "p1", status: "settled", expirationLedger: 0, txHash: "abc123def456abc123def456" },
    };
    const settlement = { txHash: "abc123def456abc123def456", closedAt: "2026-10-05T17:50:51.000Z", circle: settled };
    // Copying the transaction says so in a toast, as it does in the app.
    const { container } = show(
      <ToastProvider>
        <CircleCard circle={settled} me={MILL} nameOf={nameOf} settlement={settlement} />
      </ToastProvider>,
    );

    expect(container.textContent).toContain("Comprobante");
    expect(container.textContent).toContain("abc123de…23def456");
    expect(screen.getAllByRole("link", { name: "Ver la transacción en la red" })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Descargar" })).toBeDefined();
  });

  test("tells a business that is not in the circle that it does not take part", () => {
    const { container } = show(<CircleCard circle={detected} me="someone else" nameOf={nameOf} />);

    expect(container.textContent).toContain("Tu negocio no participa en este círculo.");
    expect(container.querySelector("dl")).toBeNull();
  });
});

describe("History", () => {
  const settlement = (txHash: string, amounts: [number, number, number]) => ({
    txHash,
    closedAt: "2026-10-05T17:50:51.000Z",
    circle: {
      ...option(txHash, amounts, [BAKERY, MILL, CARRIER]),
      proposal: { id: txHash, status: "settled" as const, expirationLedger: 0, txHash },
    },
  });

  test("lists every settlement and opens its detail on request", () => {
    const { container } = show(
      <History
        settlements={[settlement("aaaa1111bbbb", [100, 80, 90]), settlement("cccc2222dddd", [80, 80, 80])]}
        me={BAKERY}
        nameOf={nameOf}
      />,
    );

    const rows = [...container.querySelectorAll("li")].map((row) => row.querySelector("p")!.textContent);
    expect(rows).toEqual([
      "Se cancelaron 270USDC moviendo 20USDC entre 3 negocios.",
      "Se cancelaron 240USDC sin mover dinero entre 3 negocios.",
    ]);
    expect(container.textContent).not.toContain("Desanudado");

    fireEvent.click(screen.getAllByRole("button", { name: "Ver detalle" })[1]!);

    expect(container.querySelector("h3")!.textContent).toBe("Se cancelaron 240USDC sin mover dinero.");
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: "Ver la transacción en la red" }).href).toEndWith("/tx/cccc2222dddd");

    fireEvent.click(screen.getByRole("button", { name: "Ocultar" }));
    expect(container.querySelector("h3")).toBeNull();
  });

  test("shows nothing while there are no settlements", () => {
    const { container } = show(<History settlements={[]} me={BAKERY} nameOf={nameOf} />);
    expect(container.textContent).toBe("");
  });
});

describe("inWords", () => {
  test("names a single business", () => {
    expect(inWords(["Molino Andes"], 0)).toBe("Molino Andes");
  });

  test("joins two names with y", () => {
    expect(inWords(["Molino Andes", "Fletes Ruta 5"], 0)).toBe("Molino Andes y Fletes Ruta 5");
  });

  test("separates the names with commas and the last one with y", () => {
    expect(inWords(["Panadería Sur", "Molino Andes", "Fletes Ruta 5"], 0)).toBe("Panadería Sur, Molino Andes y Fletes Ruta 5");
  });

  test("counts the businesses it cannot name after the ones it can", () => {
    expect(inWords(["Molino Andes"], 2)).toBe("Molino Andes y 2 negocios más");
    expect(inWords(["Molino Andes"], 1)).toBe("Molino Andes y 1 negocio más");
  });

  test("only counts them when it can name none", () => {
    expect(inWords([], 1)).toBe("1 negocio");
    expect(inWords([], 3)).toBe("3 negocios");
  });
});
