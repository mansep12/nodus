import {
  Address,
  BASE_FEE,
  FeeBumpTransaction,
  Keypair,
  Operation,
  TransactionBuilder,
  rpc,
  scValToNative,
  xdr,
  type Transaction,
} from "@stellar/stellar-sdk";
import { NETWORK_PASSPHRASE, RPC_URL } from "@nodus/stellar";

// Per-transaction Soroban limits, identical on testnet and mainnet (protocol 29).
export const TX_LIMITS = {
  instructions: 400_000_000,
  diskReadBytes: 200_000,
  writeBytes: 132_096,
  writeEntries: 200,
  footprintEntries: 400,
  sizeBytes: 132_096,
};

export const server = new rpc.Server(RPC_URL);

/** Waits for a submitted transaction and fails unless it succeeded. */
export async function confirm(txHash: string) {
  const result = await server.pollTransaction(txHash, { attempts: 30 });
  if (result.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    throw new Error(`Transaction ${txHash} ended as ${result.status}`);
  }
  return result;
}

export async function sendAndConfirm(tx: Transaction, signer: Keypair) {
  tx.sign(signer);
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR") {
    throw new Error(`Submission rejected: ${sent.errorResult?.toXDR("base64")}`);
  }
  return confirm(sent.hash);
}

/** Resources declared by a confirmed transaction, the figures the network limits apply to. */
export function declaredResources(result: rpc.Api.GetSuccessfulTransactionResponse) {
  const parsed = TransactionBuilder.fromXDR(result.envelopeXdr, NETWORK_PASSPHRASE);
  const tx = parsed instanceof FeeBumpTransaction ? parsed.innerTransaction : parsed;
  const resources = tx.toEnvelope().v1().tx().ext().sorobanData().resources();
  const footprint = resources.footprint();
  return {
    instructions: resources.instructions(),
    diskReadBytes: resources.diskReadBytes(),
    writeBytes: resources.writeBytes(),
    writeEntries: footprint.readWrite().length,
    footprintEntries: footprint.readOnly().length + footprint.readWrite().length,
    sizeBytes: result.envelopeXdr.toXDR().length,
    feeStroops: Number(result.resultXdr.feeCharged().toString()),
  };
}

export async function buildTransaction(source: Keypair, operation: xdr.Operation): Promise<Transaction> {
  const account = await server.getAccount(source.publicKey());
  return new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: NETWORK_PASSPHRASE })
    .addOperation(operation)
    .setTimeout(120)
    .build();
}

/** Simulates, signs with `source` and submits a single operation. */
export async function submit(source: Keypair, operation: xdr.Operation) {
  const prepared = await server.prepareTransaction(await buildTransaction(source, operation));
  return sendAndConfirm(prepared, source);
}

/** Reads a contract function through simulation, without submitting anything. */
export async function read<T>(source: Keypair, contract: string, fn: string, args: xdr.ScVal[] = []): Promise<T> {
  const tx = await buildTransaction(source, Operation.invokeContractFunction({ contract, function: fn, args }));
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result) {
    throw new Error(`${fn} failed: ${"error" in simulation ? simulation.error : "no result"}`);
  }
  return scValToNative(simulation.result.retval) as T;
}

export const addressVal = (address: string) => Address.fromString(address).toScVal();
