import { afterEach, describe, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

// The screen talks to the session only through its props; nothing here creates a passkey or reaches the network.
mock.module("@/lib/actions", () => ({
  registerDebt: async () => 0n,
  acceptDebt: async () => {},
  rejectDebt: async () => {},
  cancelDebt: async () => {},
  payDebt: async () => {},
  signCircle: async () => {},
  explain: (error: unknown) => String(error),
}));
mock.module("@/lib/session", () => ({ useSession: () => ({}) }));
const { WelcomeScreen } = await import("./welcome");

const noop = () => {};
const handlers = { onCreate: noop, creating: false, onEnter: noop, entering: false as const, problem: null, testPasskeys: null };

afterEach(cleanup);

describe("WelcomeScreen", () => {
  test("says what Nodus offers before anything else, and shows the product playing", () => {
    const { container } = render(<WelcomeScreen {...handlers} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Cancela lo que debes con lo que te deben, sin esperar a que te paguen.",
    );
    expect(container.querySelector("figure")!.textContent).toContain("Tres negocios se deben en círculo: 270 en deudas.");
  });

  test("creates the account with the name typed, without the spaces around it", () => {
    const onCreate = mock((name: string) => name);
    render(<WelcomeScreen {...handlers} onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText("Crea la cuenta de tu negocio"), { target: { value: "  Panadería Sur " } });
    fireEvent.click(screen.getByRole("button", { name: "Crear cuenta con passkey" }));

    expect(onCreate).toHaveBeenCalledWith("Panadería Sur");
    expect(screen.getByPlaceholderText("Nombre del negocio")).toBeDefined();
  });

  test("enters with the passkey of the device from the hero and from the top of the page", () => {
    const onEnter = mock((credentialId?: string) => credentialId);
    render(<WelcomeScreen {...handlers} onEnter={onEnter} />);

    fireEvent.click(screen.getByRole("button", { name: "Entrar con mi passkey" }));
    fireEvent.click(screen.getByRole("button", { name: "Entrar" }));

    expect(onEnter).toHaveBeenCalledTimes(2);
    expect(onEnter.mock.calls.every(([credentialId]) => credentialId === undefined)).toBe(true);
  });

  test("while something is under way, nothing else can be started", () => {
    render(<WelcomeScreen {...handlers} creating />);

    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Creando la cuenta…" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Entrar con mi passkey" }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>("button", { name: "Entrar" }).disabled).toBe(true);
  });

  test("in test mode, offers the keys kept in the browser instead of the device passkey", () => {
    const onEnter = mock((credentialId?: string) => credentialId);
    const testPasskeys = [
      { credentialId: "k1", name: "Panadería Sur" },
      { credentialId: "k2", name: "Molino Andes" },
    ];
    render(<WelcomeScreen {...handlers} onEnter={onEnter} testPasskeys={testPasskeys} />);

    expect(screen.getByText("Modo de prueba.")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Entrar con mi passkey" })).toBeNull();
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: "Entrar" }).hash).toBe("#modo-de-prueba");

    fireEvent.click(screen.getByRole("button", { name: "Molino Andes" }));
    expect(onEnter).toHaveBeenCalledWith("k2");

    cleanup();
    render(<WelcomeScreen {...handlers} testPasskeys={[]} />);
    expect(screen.getByText(/Todavía no hay ninguna/).textContent).toContain("crea una cuenta arriba");
  });

  test("says what went wrong where the form is", () => {
    render(<WelcomeScreen {...handlers} problem="La passkey fue rechazada." />);
    expect(screen.getByRole("alert").textContent).toBe("La passkey fue rechazada.");
  });

  test("is one page with one headline, a band per section and every band named by its heading", () => {
    const { container } = render(<WelcomeScreen {...handlers} />);

    expect(container.querySelectorAll("h1")).toHaveLength(1);
    const sections = [...container.querySelectorAll("main section[id]")];
    expect(sections.map((section) => section.id)).toEqual([
      "inicio",
      "el-nudo",
      "como-funciona",
      "beneficios",
      "por-que-stellar",
      "preguntas",
      "empezar",
    ]);
    for (const section of sections) {
      const heading = section.getAttribute("aria-labelledby")!;
      expect(section.querySelector(`#${heading}`)!.tagName).toMatch(/^H[12]$/);
    }
    expect(container.querySelectorAll("header, main, footer")).toHaveLength(3);
    expect(container.querySelector("nav[aria-label='Secciones de la página']")).not.toBeNull();
  });

  test("links the two settlements on the test network that prove it, and the code", () => {
    render(<WelcomeScreen {...handlers} />);

    const proofs = screen.getAllByRole<HTMLAnchorElement>("link", { name: /Ver la transacción en la red/ });
    expect(proofs.map((link) => link.href)).toEqual([
      "https://stellar.expert/explorer/testnet/tx/da968b3a8e5ec4a1008d67e5f6ef1bc9df330bf922fbb0e58862245558039b63",
      "https://stellar.expert/explorer/testnet/tx/a2f068a9bf2dbdf736ddabf5860edcce487f0bf3230af49e246881f819558fdd",
    ]);
    expect(screen.getByRole<HTMLAnchorElement>("link", { name: "Código en GitHub" }).href).toBe("https://github.com/mansep12/nodus");
  });

  test("answers the objections without pretending: not real money, no legal effect by itself", () => {
    const { container } = render(<WelcomeScreen {...handlers} />);
    const faq = container.querySelector("#preguntas")!;

    expect(faq.querySelectorAll("details")).toHaveLength(8);
    expect(faq.textContent).toContain("Hoy no. Nodus corre en la red de pruebas de Stellar");
    expect(faq.textContent).toContain("Por sí sola, la compensación en la red no lo tiene.");
    expect(faq.textContent).toContain("en la red quedan las direcciones, que son públicas");
  });
});
