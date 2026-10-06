import { describe, expect, test } from "bun:test";
import { countPending, readBooks, readInbox } from "./books";
import { FOCUS, SCENARIOS } from "./fixtures";

const me = FOCUS.address;
const state = SCENARIOS.completa.build();
const names = new Map(state.businesses.map((business) => [business.address, business.name]));
const nameOf = (address: string) => names.get(address) ?? address;
const units = (amount: number) => BigInt(amount) * 10_000_000n;

describe("readBooks", () => {
  test("adds up what each business owes, keeping what is not accepted yet apart", () => {
    const credit = readBooks(state, me, "credit", nameOf);

    expect(credit.standing).toBe(units(1_228));
    expect(credit.pending).toBe(units(45));
    // Two debts of the same business are one relation.
    const cafe = credit.relations.find((relation) => relation.name === "Café Cordillera")!;
    expect([cafe.standing, cafe.debts]).toEqual([units(620), 2]);
    const vina = credit.relations.find((relation) => relation.name === "Viña Los Boldos")!;
    expect([vina.standing, vina.pending]).toEqual([0n, units(45)]);
  });

  test("leaves out debts that are settled, and marks the ones a circle can cancel", () => {
    const debt = readBooks(state, me, "debt", nameOf);

    expect(debt.relations.map((relation) => relation.name)).not.toContain("Taller Lo Prado");
    expect(debt.obligations.some((obligation) => obligation.status === "settled")).toBe(true);
    const inCircles = debt.relations.filter((relation) => relation.inCircle).map((relation) => relation.name);
    expect(inCircles.sort()).toEqual(["Ferretería El Roble", "Lácteos Ñuble", "Molino Andes"]);
  });
});

describe("readInbox", () => {
  test("tells what waits for the business from what waits for the others", () => {
    const inbox = readInbox(state, me);

    expect(inbox.toSign.map((circle) => circle.parties.length)).toEqual([5]);
    expect(inbox.found.map((circle) => circle.parties.length)).toEqual([3]);
    expect(inbox.waiting.map((circle) => circle.parties.length)).toEqual([4]);
    expect(inbox.toAccept.map((obligation) => nameOf(obligation.creditor))).toEqual(["Imprenta Bellavista"]);
    expect(inbox.awaited.map((obligation) => nameOf(obligation.debtor))).toEqual(["Viña Los Boldos"]);
    expect(countPending(state, me)).toEqual({ toSign: 2, toAccept: 1 });
  });

  test("moves a circle to the settled ones once it is", () => {
    const inbox = readInbox(SCENARIOS.firmada.build(), me);

    expect(inbox.toSign).toEqual([]);
    expect(inbox.settled.map((circle) => circle.cleared)).toEqual([units(870).toString()]);
  });

  test("has nothing for a business that just joined", () => {
    expect(countPending(SCENARIOS.nueva.build(), me)).toEqual({ toSign: 0, toAccept: 0 });
  });
});
