import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { Pending } from "./pending";

afterEach(cleanup);

describe("Pending", () => {
  test("says what is waiting on the business", () => {
    expect(render(<Pending toAccept={1} toSign={0} />).container.textContent).toBe("Tienes una deuda por aceptar.");
    cleanup();
    expect(render(<Pending toAccept={3} toSign={2} />).container.textContent).toBe(
      "Falta tu firma en 2 círculos. Tienes 3 deudas por aceptar.",
    );
  });

  test("shows nothing when nothing is waiting", () => {
    expect(render(<Pending toAccept={0} toSign={0} />).container.textContent).toBe("");
  });
});
