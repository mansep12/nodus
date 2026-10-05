import { Address, xdr } from "@stellar/stellar-sdk";

/** The address credentials of an auth entry, whichever version the network produced. */
export function addressCredentials(entry: xdr.SorobanAuthorizationEntry): xdr.SorobanAddressCredentials {
  const credentials = entry.credentials();
  return credentials.switch().name === "sorobanCredentialsAddressV2" ? credentials.addressV2() : credentials.address();
}

/** The account an auth entry asks a signature from. */
export function entryAddress(entry: xdr.SorobanAuthorizationEntry): string {
  return Address.fromScAddress(addressCredentials(entry).address()).toString();
}

/**
 * The context rule ids a smart account signs an auth entry under: one per
 * invocation in the entry, all of them the account's default rule (id 0).
 */
export function defaultRuleIds(entry: xdr.SorobanAuthorizationEntry): number[] {
  const count = (invocation: xdr.SorobanAuthorizedInvocation): number =>
    invocation.subInvocations().reduce((total, sub) => total + count(sub), 1);
  return new Array(count(entry.rootInvocation())).fill(0);
}
