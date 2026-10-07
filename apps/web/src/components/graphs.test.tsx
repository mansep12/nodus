import { afterEach, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import { readBooks, readInbox } from "@/lib/books";
import { FOCUS, SCENARIOS } from "@/lib/fixtures";

// Signing needs a passkey and the network; nothing here signs.
mock.module("@/lib/actions", () => ({ signCircle: async () => {}, explain: (error: unknown) => String(error) }));
mock.module("@/lib/api", () => ({ fetchState: async () => ({}), post: async () => ({}) }));
const { CircleCard } = await import("./circle-card");
const { CircleGraph } = await import("./circle-graph");
const { StarGraph, fold, OTHERS } = await import("./star-graph");

const me = FOCUS.address;
const state = SCENARIOS.completa.build();
const names = new Map(state.businesses.map((business) => [business.address, business.name]));
const nameOf = (address: string) => names.get(address) ?? address;
const inbox = readInbox(state, me);

afterEach(cleanup);

describe("CircleGraph", () => {
  test("names only the business looking and the two it deals with", () => {
    const [circle] = inbox.toSign;
    const { container } = render(<CircleGraph circle={circle!} me={me} nameOf={nameOf} />);
    const written = [...container.querySelectorAll("text")].map((text) => text.textContent);

    expect(written).toContain("Panadería Sur (tú)");
    expect(written).toContain("Ferretería El Roble");
    expect(written).toContain("le debes 210");
    expect(written).toContain("Frutos del Maule");
    expect(written).toContain("te debe 150");
    for (const stranger of ["Aserradero Lonquimay", "Envases Biobío"]) {
      expect(container.textContent).not.toContain(stranger);
    }
    // The rest are still there, saying only whether they signed.
    const titles = [...container.querySelectorAll("title")].map((title) => title.textContent);
    expect(titles.filter((title) => title === "Otro negocio del círculo: ya firmó")).toHaveLength(2);
  });

  test("names nobody in a circle seen from outside", () => {
    const [circle] = inbox.found;
    const { container } = render(<CircleGraph circle={circle!} me="someone else" nameOf={nameOf} />);

    expect(container.textContent).not.toContain("Molino Andes");
  });
});

describe("CircleCard", () => {
  test("counts the parties it does not name among the signatures still missing", () => {
    const [circle] = inbox.waiting;
    const { container } = render(
      <QueryClientProvider client={new QueryClient()}>
        <CircleCard circle={circle!} me={me} nameOf={nameOf} />
      </QueryClientProvider>,
    );

    expect(container.textContent).toContain("Ya firmaste. Faltan las firmas de Minimarket Don Tito y 1 negocio más.");
  });
});

describe("StarGraph", () => {
  test("draws a leaf for every business on that side of the books", () => {
    const { relations } = readBooks(state, me, "credit", nameOf);
    const { container } = render(
      <StarGraph tone="credit" focus="Panadería Sur" relations={relations} selected={null} onSelect={() => {}} />,
    );

    const leaves = [...container.querySelectorAll('[role="img"]')].map((leaf) => leaf.getAttribute("aria-label"));
    expect(leaves).toContain("Café Cordillera te debe 620 USDC");
    expect(leaves).toContain("Viña Los Boldos te debe 45 USDC, por aceptar");
    expect(leaves).toHaveLength(6);
  });

  test("folds the relations that do not fit into one leaf, keeping the largest", () => {
    const { relations } = readBooks(SCENARIOS.grande.build(), me, "credit", nameOf);
    const leaves = fold(relations);

    expect(relations).toHaveLength(13);
    expect(leaves).toHaveLength(9);
    expect(leaves[0]!.name).toBe("Café Cordillera");
    const others = leaves.at(-1)!;
    expect([others.address, others.name, others.debts]).toEqual([OTHERS, "Otros 5 negocios", 5]);
    expect(leaves.reduce((sum, leaf) => sum + leaf.standing + leaf.pending, 0n)).toBe(
      relations.reduce((sum, relation) => sum + relation.standing + relation.pending, 0n),
    );
  });
});
