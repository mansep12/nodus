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
 * Only obligations accepted by the debtor can be settled or paid.
 */
accepted: boolean;
  /**
 * Outstanding amount, in units of the settlement token.
 */
amount: i128;
  creditor: string;
  debtor: string;
  /**
 * When the debt falls due, as a Unix timestamp, if agreed.
 */
due: Option<u64>;
  /**
 * Hash of the document behind the debt (an invoice, a contract), if any.
 */
reference: Option<Buffer>;
}


export interface Client {
  /**
   * Construct and simulate a pay transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The debtor pays `amount` of an accepted obligation to the creditor in
   * the settlement token. What a settlement leaves owed gets paid this way.
   */
  pay: ({id, amount}: {id: u64, amount: i128}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

  /**
   * Construct and simulate a count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * How many obligations have been registered: ids run from 0 to this, exclusive.
   */
  count: (options?: MethodOptions) => Promise<AssembledTransaction<u64>>

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
   * Construct and simulate a reject transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * The debtor refuses an obligation it has not accepted, which removes it.
   */
  reject: ({id}: {id: u64}, options?: MethodOptions) => Promise<AssembledTransaction<Result<void>>>

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
   * The creditor records that `debtor` owes them `amount`, optionally
   * pointing at the document behind it and the date it falls due.
   */
  register: ({creditor, debtor, amount, reference, due}: {creditor: string, debtor: string, amount: i128, reference: Option<Buffer>, due: Option<u64>}, options?: MethodOptions) => Promise<AssembledTransaction<Result<u64>>>

  /**
   * Construct and simulate a keep_alive transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   * Keeps the given obligations from expiring. Anyone may call it; it does
   * nothing for obligations that no longer exist.
   */
  keep_alive: ({ids}: {ids: Array<u64>}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

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
      new ContractSpec([ "AAAABQAAADZQYXJ0IG9mIGFuIG9ibGlnYXRpb24gd2FzIHBhaWQgZGlyZWN0bHkgYnkgdGhlIGRlYnRvci4AAAAAAAAAAAAEUGFpZAAAAAEAAAAEcGFpZAAAAAMAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAAAAAAJcmVtYWluaW5nAAAAAAAACwAAAAAAAAAC",
        "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACAAAAAAAAAANSW52YWxpZEFtb3VudAAAAAAAAAEAAAAAAAAACVNhbWVQYXJ0eQAAAAAAAAIAAAAAAAAACE5vdEZvdW5kAAAAAwAAAAAAAAAPQWxyZWFkeUFjY2VwdGVkAAAAAAQAAAAAAAAAC05vdEFjY2VwdGVkAAAAAAUAAAAAAAAAD0VtcHR5U2V0dGxlbWVudAAAAAAGAAAAPkNsZWFyaW5ncyBtdXN0IGJlIHNvcnRlZCBieSBzdHJpY3RseSBpbmNyZWFzaW5nIG9ibGlnYXRpb24gaWQuAAAAAAARVW5zb3J0ZWRDbGVhcmluZ3MAAAAAAAAHAAAAAAAAABFFeGNlZWRzT2JsaWdhdGlvbgAAAAAAAAg=",
        "AAAABQAAADRQYXJ0IG9mIGFuIG9ibGlnYXRpb24gd2FzIGNhbmNlbGxlZCBieSBhIHNldHRsZW1lbnQuAAAAAAAAAAdDbGVhcmVkAAAAAAEAAAAHY2xlYXJlZAAAAAADAAAAAAAAAAJpZAAAAAAABgAAAAEAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAAAAAACXJlbWFpbmluZwAAAAAAAAsAAAAAAAAAAg==",
        "AAAABQAAAElTdW1tYXJ5IG9mIGEgc2V0dGxlbWVudDogYGNsZWFyZWRgIG9mIGRlYnQgY2FuY2VsbGVkIG1vdmluZyBvbmx5IGBtb3ZlZGAuAAAAAAAAAAAAAAdTZXR0bGVkAAAAAAEAAAAHc2V0dGxlZAAAAAADAAAAAAAAAAdjbGVhcmVkAAAAAAsAAAAAAAAAAAAAAAVtb3ZlZAAAAAAAAAsAAAAAAAAAAAAAAAdwYXJ0aWVzAAAAAAQAAAAAAAAAAg==",
        "AAAAAQAAADFIb3cgbXVjaCBvZiBvYmxpZ2F0aW9uIGBpZGAgYSBzZXR0bGVtZW50IGNhbmNlbHMuAAAAAAAAAAAAAAhDbGVhcmluZwAAAAIAAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAACaWQAAAAAAAY=",
        "AAAABQAAAAAAAAAAAAAACEFjY2VwdGVkAAAAAQAAAAhhY2NlcHRlZAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAAAI=",
        "AAAABQAAADVUaGUgZGVidG9yIHJlZnVzZWQgYW4gb2JsaWdhdGlvbiBiZWZvcmUgYWNjZXB0aW5nIGl0LgAAAAAAAAAAAAAIUmVqZWN0ZWQAAAABAAAACHJlamVjdGVkAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAAAg==",
        "AAAABQAAAAAAAAAAAAAACUNhbmNlbGxlZAAAAAAAAAEAAAAJY2FuY2VsbGVkAAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAAAg==",
        "AAAAAQAAADRBIGRlYnQgb2YgYGFtb3VudGAgdGhhdCBgZGVidG9yYCBvd2VzIHRvIGBjcmVkaXRvcmAuAAAAAAAAAApPYmxpZ2F0aW9uAAAAAAAGAAAAP09ubHkgb2JsaWdhdGlvbnMgYWNjZXB0ZWQgYnkgdGhlIGRlYnRvciBjYW4gYmUgc2V0dGxlZCBvciBwYWlkLgAAAAAIYWNjZXB0ZWQAAAABAAAANU91dHN0YW5kaW5nIGFtb3VudCwgaW4gdW5pdHMgb2YgdGhlIHNldHRsZW1lbnQgdG9rZW4uAAAAAAAABmFtb3VudAAAAAAACwAAAAAAAAAIY3JlZGl0b3IAAAATAAAAAAAAAAZkZWJ0b3IAAAAAABMAAAA4V2hlbiB0aGUgZGVidCBmYWxscyBkdWUsIGFzIGEgVW5peCB0aW1lc3RhbXAsIGlmIGFncmVlZC4AAAADZHVlAAAAA+gAAAAGAAAARkhhc2ggb2YgdGhlIGRvY3VtZW50IGJlaGluZCB0aGUgZGVidCAoYW4gaW52b2ljZSwgYSBjb250cmFjdCksIGlmIGFueS4AAAAAAAlyZWZlcmVuY2UAAAAAAAPoAAAD7gAAACA=",
        "AAAABQAAAAAAAAAAAAAAClJlZ2lzdGVyZWQAAAAAAAEAAAAKcmVnaXN0ZXJlZAAAAAAABgAAAAAAAAACaWQAAAAAAAYAAAABAAAAAAAAAAhjcmVkaXRvcgAAABMAAAAAAAAAAAAAAAZkZWJ0b3IAAAAAABMAAAAAAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAAAAAAAAlyZWZlcmVuY2UAAAAAAAPoAAAD7gAAACAAAAAAAAAAAAAAAANkdWUAAAAD6AAAAAYAAAAAAAAAAg==",
        "AAAAAAAAAI1UaGUgZGVidG9yIHBheXMgYGFtb3VudGAgb2YgYW4gYWNjZXB0ZWQgb2JsaWdhdGlvbiB0byB0aGUgY3JlZGl0b3IgaW4KdGhlIHNldHRsZW1lbnQgdG9rZW4uIFdoYXQgYSBzZXR0bGVtZW50IGxlYXZlcyBvd2VkIGdldHMgcGFpZCB0aGlzIHdheS4AAAAAAAADcGF5AAAAAAIAAAAAAAAAAmlkAAAAAAAGAAAAAAAAAAZhbW91bnQAAAAAAAsAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAE1Ib3cgbWFueSBvYmxpZ2F0aW9ucyBoYXZlIGJlZW4gcmVnaXN0ZXJlZDogaWRzIHJ1biBmcm9tIDAgdG8gdGhpcywgZXhjbHVzaXZlLgAAAAAAAAVjb3VudAAAAAAAAAAAAAABAAAABg==",
        "AAAAAAAAAAAAAAAFdG9rZW4AAAAAAAAAAAAAAQAAABM=",
        "AAAAAAAAAEpUaGUgZGVidG9yIGFja25vd2xlZGdlcyB0aGUgb2JsaWdhdGlvbiwgbWFraW5nIGl0IGVsaWdpYmxlIGZvciBzZXR0bGVtZW50LgAAAAAABmFjY2VwdAAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAAAIAAAAD",
        "AAAAAAAAAENUaGUgY3JlZGl0b3Igd2l0aGRyYXdzIGFuIG9ibGlnYXRpb24gKGZvcmdpdmVuLCBvciBwYWlkIGVsc2V3aGVyZSkuAAAAAAZjYW5jZWwAAAAAAAEAAAAAAAAAAmlkAAAAAAAGAAAAAQAAA+kAAAACAAAAAw==",
        "AAAAAAAAAEdUaGUgZGVidG9yIHJlZnVzZXMgYW4gb2JsaWdhdGlvbiBpdCBoYXMgbm90IGFjY2VwdGVkLCB3aGljaCByZW1vdmVzIGl0LgAAAAAGcmVqZWN0AAAAAAABAAAAAAAAAAJpZAAAAAAABgAAAAEAAAPpAAAAAgAAAAM=",
        "AAAAAAAAAWFDYW5jZWxzIGBjbGVhcmluZ3NgIGFuZCBwYXlzIG9ubHkgdGhlIG5ldCBiYWxhbmNlIG9mIGVhY2ggcGFydHkuCgpBIHBhcnR5J3MgbmV0IGlzIHdoYXQgdGhleSBzdG9wIGJlaW5nIG93ZWQgbWludXMgd2hhdCB0aGV5IHN0b3Agb3dpbmcuClBhcnRpZXMgd2l0aCBhIG5lZ2F0aXZlIG5ldCBwYXkgaXQgaW47IHBhcnRpZXMgd2l0aCBhIHBvc2l0aXZlIG5ldCBhcmUKcGFpZCBvdXQsIHNvIG5vYm9keSBlbmRzIHVwIGJldHRlciBvciB3b3JzZSBvZmYgdGhhbiBiZWZvcmUuIEV2ZXJ5IHBhcnR5Cm11c3QgYXV0aG9yaXplIHRoZSBleGFjdCBzYW1lIHNldCBvZiBjbGVhcmluZ3MuIFJldHVybnMgdGhlIHRvdGFsIG1vdmVkLgAAAAAAAAZzZXR0bGUAAAAAAAEAAAAAAAAACWNsZWFyaW5ncwAAAAAAA+oAAAfQAAAACENsZWFyaW5nAAAAAQAAA+kAAAALAAAAAw==",
        "AAAAAAAAAH9UaGUgY3JlZGl0b3IgcmVjb3JkcyB0aGF0IGBkZWJ0b3JgIG93ZXMgdGhlbSBgYW1vdW50YCwgb3B0aW9uYWxseQpwb2ludGluZyBhdCB0aGUgZG9jdW1lbnQgYmVoaW5kIGl0IGFuZCB0aGUgZGF0ZSBpdCBmYWxscyBkdWUuAAAAAAhyZWdpc3RlcgAAAAUAAAAAAAAACGNyZWRpdG9yAAAAEwAAAAAAAAAGZGVidG9yAAAAAAATAAAAAAAAAAZhbW91bnQAAAAAAAsAAAAAAAAACXJlZmVyZW5jZQAAAAAAA+gAAAPuAAAAIAAAAAAAAAADZHVlAAAAA+gAAAAGAAAAAQAAA+kAAAAGAAAAAw==",
        "AAAAAAAAAHRLZWVwcyB0aGUgZ2l2ZW4gb2JsaWdhdGlvbnMgZnJvbSBleHBpcmluZy4gQW55b25lIG1heSBjYWxsIGl0OyBpdCBkb2VzCm5vdGhpbmcgZm9yIG9ibGlnYXRpb25zIHRoYXQgbm8gbG9uZ2VyIGV4aXN0LgAAAAprZWVwX2FsaXZlAAAAAAABAAAAAAAAAANpZHMAAAAD6gAAAAYAAAAA",
        "AAAAAAAAAAAAAAAKb2JsaWdhdGlvbgAAAAAAAQAAAAAAAAACaWQAAAAAAAYAAAABAAAD6QAAB9AAAAAKT2JsaWdhdGlvbgAAAAAAAw==",
        "AAAAAAAAAEFgdG9rZW5gIGlzIHRoZSBhc3NldCBpbiB3aGljaCBuZXQgYmFsYW5jZXMgYW5kIHBheW1lbnRzIGFyZSBtYWRlLgAAAAAAAA1fX2NvbnN0cnVjdG9yAAAAAAAAAQAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==" ]),
      options
    )
  }
  public readonly fromJSON = {
    pay: this.txFromJSON<Result<void>>,
        count: this.txFromJSON<u64>,
        token: this.txFromJSON<string>,
        accept: this.txFromJSON<Result<void>>,
        cancel: this.txFromJSON<Result<void>>,
        reject: this.txFromJSON<Result<void>>,
        settle: this.txFromJSON<Result<i128>>,
        register: this.txFromJSON<Result<u64>>,
        keep_alive: this.txFromJSON<null>,
        obligation: this.txFromJSON<Result<Obligation>>
  }
}