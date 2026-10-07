import { describe, expect, mock, test } from "bun:test";
import { Address, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import type * as Actions from "./actions";
import type { CircleView, PartyView } from "./types";

// The kit drives passkeys in the browser; nothing here signs.
mock.module("@/lib/kit", () => ({
  getKit: () => ({}),
  getStorage: () => ({}),
  seedCredentials: async () => {},
  describeCredential: async () => undefined,
}));
// Bun keeps a module mock for the rest of the run, so the stand-in the component tests use may be in place;
// the query string loads the real one.
const actions = "./actions.ts?real";
const { assertMatches, explain } = (await import(actions)) as typeof Actions;

const NODUS = process.env.NEXT_PUBLIC_NODUS_CONTRACT!;
const TOKEN = process.env.NEXT_PUBLIC_TOKEN_CONTRACT!;
const contractId = (byte: number) => StrKey.encodeContract(Buffer.alloc(32, byte));
const [BAKERY, MILL, CARRIER] = [contractId(7), contractId(8), contractId(9)];
const MISMATCH = "La solicitud de firma no coincide con el círculo en pantalla.";

const party = (address: string, net: bigint): PartyView => ({
  address,
  known: true,
  owesLess: "0",
  owedLess: "0",
  net: `${net}`,
  signed: false,
});

/** Bakery → mill → carrier → bakery, cancelling 100, 80 and 90: the bakery and the carrier pay 10 each, the mill receives 20. */
const circle: CircleView = {
  key: "circle",
  clearings: [
    { id: "0", amount: "100" },
    { id: "1", amount: "80" },
    { id: "2", amount: "90" },
  ],
  parties: [party(BAKERY, -10n), party(MILL, 20n), party(CARRIER, -10n)],
  edges: [],
  cleared: "270",
  moved: "20",
};
const CLEARINGS: Array<[id: bigint, amount: bigint]> = [
  [0n, 100n],
  [1n, 80n],
  [2n, 90n],
];

function invocation(contract: string, fn: string, args: xdr.ScVal[], subInvocations: xdr.SorobanAuthorizedInvocation[] = []) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({ contractAddress: Address.fromString(contract).toScAddress(), functionName: fn, args }),
    ),
    subInvocations,
  });
}

interface Payment {
  token?: string;
  fn?: string;
  from?: string;
  to?: string;
  amount?: bigint;
  then?: xdr.SorobanAuthorizedInvocation[];
}

/** By default, the bakery paying its net into the Nodus contract. */
function payment({ token = TOKEN, fn = "transfer", from = BAKERY, to = NODUS, amount = 10n, then = [] }: Payment = {}) {
  const args = [Address.fromString(from).toScVal(), Address.fromString(to).toScVal(), nativeToScVal(amount, { type: "i128" })];
  return invocation(token, fn, args, then);
}

interface Entry {
  address?: string;
  contract?: string;
  fn?: string;
  clearings?: Array<[id: bigint, amount: bigint]>;
  payments?: xdr.SorobanAuthorizedInvocation[];
}

/** What the server asks `address` to sign: by default, the bakery's part of the circle, paying its net. */
function request({ address = BAKERY, contract = NODUS, fn = "settle", clearings = CLEARINGS, payments = [payment()] }: Entry = {}) {
  const clearingsArg = nativeToScVal(
    clearings.map(([id, amount]) => ({ id, amount })),
    { type: { id: ["symbol", "u64"], amount: ["symbol", "i128"] } },
  );
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(address).toScAddress(),
        nonce: xdr.Int64.fromString("1"),
        signatureExpirationLedger: 1_000,
        signature: xdr.ScVal.scvVoid(),
      }),
    ),
    rootInvocation: invocation(contract, fn, [clearingsArg], payments),
  });
}

describe("assertMatches", () => {
  test("accepts the circle on screen with the payment of a party that pays its net", () => {
    expect(() => assertMatches(request(), circle, BAKERY)).not.toThrow();
    expect(() => assertMatches(request({ address: CARRIER, payments: [payment({ from: CARRIER })] }), circle, CARRIER)).not.toThrow();
  });

  test("accepts the circle on screen without a payment for a party that receives money", () => {
    expect(() => assertMatches(request({ address: MILL, payments: [] }), circle, MILL)).not.toThrow();
  });

  test("refuses an entry that asks another account to sign", () => {
    expect(() => assertMatches(request({ address: CARRIER }), circle, BAKERY)).toThrow(MISMATCH);
  });

  test("refuses anything but a call to settle on the Nodus contract", () => {
    expect(() => assertMatches(request({ contract: TOKEN }), circle, BAKERY)).toThrow(MISMATCH);
    expect(() => assertMatches(request({ fn: "pay" }), circle, BAKERY)).toThrow(MISMATCH);
  });

  test("refuses clearings other than the ones on screen", () => {
    const otherId: typeof CLEARINGS = [
      [0n, 100n],
      [3n, 80n],
      [2n, 90n],
    ];
    const otherAmount: typeof CLEARINGS = [
      [0n, 100n],
      [1n, 81n],
      [2n, 90n],
    ];

    expect(() => assertMatches(request({ clearings: otherId }), circle, BAKERY)).toThrow(MISMATCH);
    expect(() => assertMatches(request({ clearings: otherAmount }), circle, BAKERY)).toThrow(MISMATCH);
    expect(() => assertMatches(request({ clearings: CLEARINGS.slice(0, 2) }), circle, BAKERY)).toThrow(MISMATCH);
    expect(() => assertMatches(request({ clearings: [...CLEARINGS, [3n, 10n]] }), circle, BAKERY)).toThrow(MISMATCH);
  });

  test("refuses any payment by a party that receives money", () => {
    const mill = { address: MILL, payments: [payment({ from: MILL, amount: 0n })] };

    expect(() => assertMatches(request(mill), circle, MILL)).toThrow(MISMATCH);
  });

  test("refuses a payer's entry without its payment", () => {
    expect(() => assertMatches(request({ payments: [] }), circle, BAKERY)).toThrow(MISMATCH);
  });

  test("refuses a payment that is not exactly the net into the Nodus contract", () => {
    const refused = (...payments: xdr.SorobanAuthorizedInvocation[]) =>
      expect(() => assertMatches(request({ payments }), circle, BAKERY)).toThrow(MISMATCH);

    // Of another token.
    refused(payment({ token: contractId(1) }));
    // To someone other than the contract.
    refused(payment({ to: MILL }));
    // Of more, or less, than the net.
    refused(payment({ amount: 11n }));
    refused(payment({ amount: 9n }));
    // From someone else's account.
    refused(payment({ from: CARRIER }));
    // Something other than a transfer.
    refused(payment({ fn: "approve" }));
    // That authorizes a further call.
    refused(payment({ then: [payment()] }));
    // Twice.
    refused(payment(), payment());
  });
});

describe("explain", () => {
  test("says what each error of the contract means", () => {
    const meanings: Record<number, string> = {
      1: "El monto no es válido.",
      2: "Un negocio no puede deberse a sí mismo.",
      3: "Esa deuda ya no existe.",
      4: "Esa deuda ya estaba aceptada.",
      5: "Esa deuda todavía no ha sido aceptada.",
      6: "El círculo no tiene deudas.",
      7: "Las deudas del círculo no están en orden.",
      8: "El monto supera lo que se debe.",
      3302: "Tu llave no tiene permiso para hacer esto. Pídeselo al dueño de la cuenta.",
    };
    for (const [code, meaning] of Object.entries(meanings)) {
      expect(explain(new Error(`HostError: Error(Contract, #${code})`))).toBe(meaning);
    }
  });

  test("tells the person they cancelled when the passkey prompt was refused", () => {
    const cancelled = "No se firmó: cancelaste o tu dispositivo no lo permitió.";

    expect(explain(new DOMException("Denied.", "NotAllowedError"))).toBe(cancelled);
    expect(explain(new Error("The operation either timed out or was not allowed."))).toBe(cancelled);
  });

  test("does not take a Spanish message about cancelling for a cancelled prompt", () => {
    const message = "No se puede cancelar una deuda que ya está aceptada.";

    expect(explain(new Error(message))).toBe(message);
  });

  test("says the account refused a signature its rule does not allow", () => {
    expect(explain(new Error("HostError: Error(Auth, InvalidAction)"))).toBe(
      "La cuenta rechazó la firma. Si usas una llave limitada, esto necesita al dueño.",
    );
  });

  test("says when the balance or the network is the problem", () => {
    expect(explain(new Error("insufficient balance"))).toBe("No alcanza el saldo para pagar.");
    expect(explain(new Error("fetch failed"))).toBe("La red no respondió. Intenta de nuevo en un momento.");
  });

  test("gives a general message for an English one it does not know", () => {
    expect(explain(new Error("Unexpected token in JSON at position 0"))).toBe("Algo falló al firmar o enviar. Intenta de nuevo.");
  });

  test("passes a message already in Spanish through", () => {
    expect(explain(new Error("El nombre ya está en uso."))).toBe("El nombre ya está en uso.");
  });
});
