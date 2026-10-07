import { describe, expect, test } from "bun:test";
import { Address, StrKey, nativeToScVal, xdr } from "@stellar/stellar-sdk";
import { defaultRuleIds, entryAddress, signedRuleId } from "./index.ts";

const ACCOUNT = StrKey.encodeContract(Buffer.alloc(32, 7));
const CONTRACT = StrKey.encodeContract(Buffer.alloc(32, 9));

function call(fn: string, subInvocations: xdr.SorobanAuthorizedInvocation[] = []) {
  return new xdr.SorobanAuthorizedInvocation({
    function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
      new xdr.InvokeContractArgs({
        contractAddress: Address.fromString(CONTRACT).toScAddress(),
        functionName: fn,
        args: [nativeToScVal(10n, { type: "i128" })],
      }),
    ),
    subInvocations,
  });
}

/** An entry asking ACCOUNT to authorize `rootInvocation`, carrying `signature` as its payload. */
function entry(signature: xdr.ScVal = xdr.ScVal.scvVoid(), rootInvocation = call("settle", [call("transfer")])) {
  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsAddress(
      new xdr.SorobanAddressCredentials({
        address: Address.fromString(ACCOUNT).toScAddress(),
        nonce: xdr.Int64.fromString("123456789"),
        signatureExpirationLedger: 5_000_000,
        signature,
      }),
    ),
    rootInvocation,
  });
}

/** The payload a smart account's signature carries, claiming the given rule for each invocation. */
const payload = (ruleIds: xdr.ScVal[]) =>
  xdr.ScVal.scvMap([
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("context_rule_ids"), val: xdr.ScVal.scvVec(ruleIds) }),
    new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("signers"), val: xdr.ScVal.scvMap([]) }),
  ]);
const signedUnder = (...ids: number[]) => entry(payload(ids.map((id) => xdr.ScVal.scvU32(id))));

describe("signedRuleId", () => {
  test("returns the rule every invocation is signed under", () => {
    expect(signedRuleId(signedUnder(0, 0))).toBe(0);
    expect(signedRuleId(signedUnder(2, 2))).toBe(2);
  });

  test("returns nothing when the invocations claim different rules", () => {
    expect(signedRuleId(signedUnder(0, 1))).toBeUndefined();
  });

  test("returns nothing when there is not one rule per invocation", () => {
    expect(signedRuleId(signedUnder(0))).toBeUndefined();
    expect(signedRuleId(signedUnder(0, 0, 0))).toBeUndefined();
  });

  test("returns nothing for an entry that is not signed", () => {
    expect(signedRuleId(entry())).toBeUndefined();
  });

  test("returns nothing when the rule ids are not a list of u32 values", () => {
    const u64 = (id: string) => xdr.ScVal.scvU64(xdr.Uint64.fromString(id));
    const notAList = xdr.ScVal.scvMap([new xdr.ScMapEntry({ key: xdr.ScVal.scvSymbol("context_rule_ids"), val: xdr.ScVal.scvU32(0) })]);

    expect(signedRuleId(entry(payload([u64("0"), u64("0")])))).toBeUndefined();
    expect(signedRuleId(entry(notAList))).toBeUndefined();
  });
});

describe("defaultRuleIds", () => {
  test("gives the default rule to every invocation in the entry, however deep", () => {
    expect(defaultRuleIds(entry())).toEqual([0, 0]);
    expect(defaultRuleIds(entry(undefined, call("settle")))).toEqual([0]);
    expect(defaultRuleIds(entry(undefined, call("settle", [call("transfer", [call("approve")]), call("transfer")])))).toEqual([0, 0, 0, 0]);
  });
});

describe("entryAddress", () => {
  test("is the account the entry asks a signature from", () => {
    expect(entryAddress(entry())).toBe(ACCOUNT);
  });
});
