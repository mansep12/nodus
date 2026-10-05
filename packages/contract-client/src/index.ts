import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}




export const Errors = {
  1: {message:"InvalidAmount"},
  2: {message:"SameParty"},
  3: {message:"NotFound"},
  4: {message:"AlreadyAccepted"},
  5: {message:"NotAccepted"},
  6: {message:"EmptySettlement"},
  /**
   * Clearings must be sorted by strictly increasing obligation id.
   */
  7: {message:"UnsortedClearings"},
  8: {message:"ExceedsObligation"}
}




/**
 * How much of obligation `id` a settlement cancels.
 */
export interface Clearing {
  amount: i128;
  id: u64;
}




/**
 * A debt of `amount` that `debtor` owes to `creditor`.
 */
export interface Obligation {
  /**
 * Only obligations accepted by the debtor can be settled.
 */
accepted: boolean;
  /**
 * Outstanding amount, in units of the settlement token.
 */
amount: i128;
  creditor: string;
  debtor: string;
}


export interface Client {
  /**
   * Construct and simulate a token transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  token: (options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a accept transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The debtor acknowledges the obligation, making it eligible for settlement.
   */
  accept: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a cancel transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The creditor withdraws an obligation (forgiven, or paid elsewhere).
   */
  cancel: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a settle transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Cancels `clearings` and pays only the net balance of each party.
   * 
   * A party's net is what they stop being owed minus what they stop owing.
   * Parties with a negative net pay it in; parties with a positive net are
   * paid out, so nobody ends up better or worse off than before. Every party
   * must authorize the exact same set of clearings. Returns the total moved.
   */
  settle: ({clearings}: {clearings: Array<Clearing>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<i128>>>

  /**
   * Construct and simulate a register transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The creditor records that `debtor` owes them `amount`.
   */
  register: ({creditor, debtor, amount}: {creditor: string, debtor: string, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a obligation transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  obligation: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<Obligation>>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {token}: {token: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({token}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACAAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAEAAAAAAAAACVNhbWVQYXJ0eQAAAAAAAAIAAAAAAAAACE5vdEZvdW5kAAAAAwAAAAAAAAAPQWxyZWFkeUFjY2VwdGVkAAAAAAQAAAAAAAAAC05vdEFjY2VwdGVkAAAAAAUAAAAAAAAAD0VtcHR5U2V0dGxlbWVudAAAAAAGAAAAPkNsZWFyaW5ncyBtdXN0IGJlIHNvcnRlZCBieSBzdHJpY3RseSBpbmNyZWFzaW5nIG9ibGlnYXRpb24gaWQuAAAAAAARVW5zb3J0ZWRDbGVhcmluZ3MAAAAAAAAHAAAAAAAAABFFeGNlZWRzT2JsaWdhdGlvbgAAAAAAAAg=",
        "AAAABQAAADRQYXJ0IG9mIGFuIG9ibGlnYXRpb24gd2FzIGNhbmNlbGxlZCBieSBhIHNldHRsZW1lbnQuAAAAAAAAAAdDbGVhcmVkAAAAAAEAAAAHY2xlYXJlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAACXJlbWFpbmluZwAAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAElTdW1tYXJ5IG9mIGEgc2V0dGxlbWVudDogYGNsZWFyZWRgIG9mIGRlYnQgY2FuY2VsbGVkIG1vdmluZyBvbmx5IGBtb3ZlZGAuAAAAAAAAAAAAAAdTZXR0bGVkAAAAAAEAAAAHc2V0dGxlZAAAAAADAAAAAAAAAAdjbGVhcmVkAAAAAAsAAAAAAAAAAAAAAAVtb3ZlZAAAAAAAAAsAAAAAAAAAAAAAAAdwYXJ0aWVzAAAAAAQAAAAAAAAAAg==",
        "AAAAAQAAADFIb3cgbXVjaCBvZiBvYmxpZ2F0aW9uIGBpZGAgYSBzZXR0bGVtZW50IGNhbmNlbHMuAAAAAAAAAAAAAAhDbGVhcmluZwAAAAIAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAACaWQAAAAAAAY=",
        "AAAABQAAAAAAAAAAAAAACEFjY2VwdGVkAAAAAQAAAAhhY2NlcHRlZAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAI=",
        "AAAABQAAAAAAAAAAAAAACUNhbmNlbGxlZAAAAAAAAAEAAAAJY2FuY2VsbGVkAAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAAAg==",
        "AAAAAQAAADRBIGRlYnQgb2YgYGFtb3VudGAgdGhhdCBgZGVidG9yYCBvd2VzIHRvIGBjcmVkaXRvcmAuAAAAAAAAAApPYmxpZ2F0aW9uAAAAAAAEAAAAN09ubHkgb2JsaWdhdGlvbnMgYWNjZXB0ZWQgYnkgdGhlIGRlYnRvciBjYW4gYmUgc2V0dGxlZC4AAAAACGFjY2VwdGVkAAAAAQAAADVPdXRzdGFuZGluZyBhbW91bnQsIGluIHVuaXRzIG9mIHRoZSBzZXR0bGVtZW50IHRva2VuLgAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACGNyZWRpdG9yAAAAEwAAAAAAAAAGZGVidG9yAAAAAAAT",
        "AAAABQAAAAAAAAAAAAAAClJlZ2lzdGVyZWQAAAAAAAEAAAAKcmVnaXN0ZXJlZAAAAAAABAAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAhjcmVkaXRvcgAAABMAAAAAAAAAAAAAAAZkZWJ0b3IAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAAFdG9rZW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAEpUaGUgZGVidG9yIGFja25vd2xlZGdlcyB0aGUgb2JsaWdhdGlvbiwgbWFraW5nIGl0IGVsaWdpYmxlIGZvciBzZXR0bGVtZW50LgAAAAAABmFjY2VwdAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAENUaGUgY3JlZGl0b3Igd2l0aGRyYXdzIGFuIG9ibGlnYXRpb24gKGZvcmdpdmVuLCBvciBwYWlkIGVsc2V3aGVyZSkuAAAAAAZjYW5jZWwAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAWFDYW5jZWxzIGBjbGVhcmluZ3NgIGFuZCBwYXlzIG9ubHkgdGhlIG5ldCBiYWxhbmNlIG9mIGVhY2ggcGFydHkuCgpBIHBhcnR5J3MgbmV0IGlzIHdoYXQgdGhleSBzdG9wIGJlaW5nIG93ZWQgbWludXMgd2hhdCB0aGV5IHN0b3Agb3dpbmcuClBhcnRpZXMgd2l0aCBhIG5lZ2F0aXZlIG5ldCBwYXkgaXQgaW47IHBhcnRpZXMgd2l0aCBhIHBvc2l0aXZlIG5ldCBhcmUKcGFpZCBvdXQsIHNvIG5vYm9keSBlbmRzIHVwIGJldHRlciBvciB3b3JzZSBvZmYgdGhhbiBiZWZvcmUuIEV2ZXJ5IHBhcnR5Cm11c3QgYXV0aG9yaXplIHRoZSBleGFjdCBzYW1lIHNldCBvZiBjbGVhcmluZ3MuIFJldHVybnMgdGhlIHRvdGFsIG1vdmVkLgAAAAAAAAZzZXR0bGUAAAAAAAEAAAAAAAAACWNsZWFyaW5ncwAAAAAAA+oAAAfQAAAACENsZWFyaW5nAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAADZUaGUgY3JlZGl0b3IgcmVjb3JkcyB0aGF0IGBkZWJ0b3JgIG93ZXMgdGhlbSBgYW1vdW50YC4AAAAAAAhyZWdpc3RlcgAAAAMAAAAAAAAACGNyZWRpdG9yAAAAEwAAAAAAAAAGZGVidG9yAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAYAAAAD",
        "AAAAAAAAAAAAAAAKb2JsaWdhdGlvbgAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAB9AAAAAKT2JsaWdhdGlvbgAAAAAAAw==",
        "AAAAAAAAADRgdG9rZW5gIGlzIHRoZSBhc3NldCBpbiB3aGljaCBuZXQgYmFsYW5jZXMgYXJlIHBhaWQuAAAADV9fY29uc3RydWN0b3IAAAAAAAABAAAAAAAAAAV0b2tlbgAAAAAAABMAAAAA" ]),
      options
    )
  }
  public readonly fromJSON = {
    token: this.txFromJSON<string>,
        accept: this.txFromJSON<Result<void>>,
        cancel: this.txFromJSON<Result<void>>,
        settle: this.txFromJSON<Result<i128>>,
        register: this.txFromJSON<Result<u64>>,
        obligation: this.txFromJSON<Result<Obligation>>
  }
}