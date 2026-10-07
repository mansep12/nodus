import { describe, expect, mock, test } from "bun:test";
import { Address, Keypair, StrKey, xdr } from "@stellar/stellar-sdk";
import { ACCOUNT_WASM_HASH } from "@nodus/stellar";

const NODUS = process.env.NEXT_PUBLIC_NODUS_CONTRACT!;
const SMART_ACCOUNT = StrKey.encodeContract(Buffer.alloc(32, 7));
const OTHER_CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 8));

// Whether an address is a smart account is read from the chain; here only SMART_ACCOUNT is one.
mock.module("@/server/chain", () => ({
  isSmartAccount: async (address: string) => address === SMART_ACCOUNT,
  forgetBalances: () => {},
  forgetRules: () => {},
}));
mock.module("@/server/limits", () => ({
  LIMITS: { relayPerIp: async () => {}, accountsPerIp: async () => {} },
  clientIp: () => "127.0.0.1",
}));
const { classify } = await import("./route");

const invoke = (contract: string, fn: string) =>
  xdr.HostFunction.hostFunctionTypeInvokeContract(
    new xdr.InvokeContractArgs({ contractAddress: Address.fromString(contract).toScAddress(), functionName: fn, args: [] }),
  ).toXDR("base64");

const create = (wasmHash: string) =>
  xdr.HostFunction.hostFunctionTypeCreateContractV2(
    new xdr.CreateContractArgsV2({
      contractIdPreimage: xdr.ContractIdPreimage.contractIdPreimageFromAddress(
        new xdr.ContractIdPreimageFromAddress({
          address: Address.fromString(Keypair.random().publicKey()).toScAddress(),
          salt: Buffer.alloc(32),
        }),
      ),
      executable: xdr.ContractExecutable.contractExecutableWasm(Buffer.from(wasmHash, "hex")),
      constructorArgs: [],
    }),
  ).toXDR("base64");

describe("classify", () => {
  test("sponsors any call to the Nodus contract", async () => {
    expect(await classify(invoke(NODUS, "register"))).toEqual({ kind: "call" });
    expect(await classify(invoke(NODUS, "settle"))).toEqual({ kind: "call" });
  });

  test("sponsors a smart account changing its own signers and rules", async () => {
    for (const fn of ["add_context_rule", "remove_context_rule", "add_signer", "remove_signer", "add_policy", "remove_policy"]) {
      expect(await classify(invoke(SMART_ACCOUNT, fn))).toEqual({ kind: "admin", account: SMART_ACCOUNT });
    }
  });

  test("does not sponsor the same change on a contract that is not a smart account", async () => {
    expect(await classify(invoke(OTHER_CONTRACT, "add_context_rule"))).toBeUndefined();
  });

  test("does not sponsor a smart account calling anything else", async () => {
    expect(await classify(invoke(SMART_ACCOUNT, "transfer"))).toBeUndefined();
    expect(await classify(invoke(SMART_ACCOUNT, "upgrade"))).toBeUndefined();
  });

  test("sponsors creating a smart account, and no other contract", async () => {
    expect(await classify(create(ACCOUNT_WASM_HASH))).toEqual({ kind: "account" });
    expect(await classify(create("ab".repeat(32)))).toBeUndefined();
  });

  test("does not sponsor other host functions or what is not one", async () => {
    const upload = xdr.HostFunction.hostFunctionTypeUploadContractWasm(Buffer.from("wasm")).toXDR("base64");

    expect(await classify(upload)).toBeUndefined();
    expect(await classify("not a host function")).toBeUndefined();
    expect(await classify("")).toBeUndefined();
  });
});
