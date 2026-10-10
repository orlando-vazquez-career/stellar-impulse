import {
  Account, BASE_FEE, Contract, humanizeEvents, rpc, scValToNative, TransactionBuilder,
  type Transaction, type xdr,
} from "@stellar/stellar-sdk";
import { ChainError, STELLAR_TESTNET, validatePublicAddress } from "./index.js";

/** Subset of rpc.Server used by the client, so tests can inject a double. */
export interface ChainRpc {
  getAccount(address: string): Promise<Account>;
  getLatestLedger(): Promise<{ sequence: number }>;
  simulateTransaction(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse>;
  prepareTransaction(tx: Transaction): Promise<Transaction>;
  sendTransaction(tx: Transaction): Promise<rpc.Api.SendTransactionResponse>;
  pollTransaction(hash: string, opts?: rpc.Server.PollingOptions): Promise<rpc.Api.GetTransactionResponse>;
}

/** Freighter's `signTransaction`, or a test double. */
export interface TransactionSigner {
  signTransaction(xdr: string, opts: { networkPassphrase: string; address: string }): Promise<{ signedTxXdr: string; error?: unknown }>;
}

export interface CallOptions {
  server?: ChainRpc;
  contractId?: string;
}

/** Existing testnet account used only as the source of read-only simulations (the cosmetics admin). */
export const SIMULATION_SOURCE = "GBKNU5OIKQ4F6GYBSHLFYFXBVJ57BU5G7MSRP2UKWM3R5WSKB6Z3M5GQ";

export const defaultServer = (): ChainRpc => new rpc.Server(STELLAR_TESTNET.rpcUrl) as unknown as ChainRpc;

export function validU32(value: unknown): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new ChainError("INVALID_RESPONSE", "Identificador invalido en la respuesta del contrato.");
  }
  return value;
}

export function buildCall(source: Account, contractId: string, method: string, args: xdr.ScVal[]): Transaction {
  return new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: STELLAR_TESTNET.networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
}

/**
 * What a player reads when a contract refuses. Codes 1-16 come from the cosmetics contract,
 * 101-111 from the marketplace (numbered apart on purpose). In a payment, #10 is the XLM
 * contract reporting an insufficient balance.
 */
const CONTRACT_MESSAGES: Record<number, string> = {
  2: "Esa pieza no existe en el catálogo.",
  3: "Esa pieza ya no existe.",
  4: "No eres dueño de esta pieza.",
  6: "Esta pieza no se puede vender ni transferir.",
  7: "Esta pieza no está a la venta.",
  8: "Esta pieza se agotó.",
  9: "Ese premio ya fue entregado.",
  10: "No tienes saldo suficiente en testnet.",
  12: "La autorización de venta venció. Publica el anuncio otra vez.",
  13: "Tu inventario está lleno.",
  14: "No puedes enviarte una pieza a ti mismo.",
  101: "Ese anuncio no existe.",
  102: "El anuncio ya no está disponible.",
  103: "El anuncio venció.",
  104: "Solo quien publicó el anuncio puede cancelarlo.",
  105: "El vendedor ya no tiene esta pieza.",
  106: "El precio tiene que ser mayor que cero.",
  107: "El precio cambió. Revisa el anuncio antes de comprar.",
  108: "No puedes comprar tu propio anuncio.",
  109: "El vendedor retiró la autorización de venta.",
  111: "La duración del anuncio no es válida.",
};

/** The player-facing text for a contract error number, if there is one. */
export function contractErrorMessage(code: number): string | undefined {
  return CONTRACT_MESSAGES[code];
}

/** Turns a simulation or submission failure into a message the hangar can show. */
export function contractError(error: unknown, fallback: string): ChainError {
  if (error instanceof ChainError) return error;
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : JSON.stringify(error ?? "");
  const code = /Error\(Contract, #(\d+)\)/.exec(text)?.[1];
  if (code) {
    const number = Number(code);
    return new ChainError("CONTRACT_REJECTED", CONTRACT_MESSAGES[number] ?? fallback, number);
  }
  if (/Account not found|404/.test(text)) {
    return new ChainError("UNFUNDED_ACCOUNT", "Tu wallet no tiene fondos en testnet. Cargala con Friendbot desde Freighter.");
  }
  return new ChainError("INVALID_RESPONSE", fallback);
}

/** The `Error(Contract, #n)` a failed transaction left in its diagnostic events, if any. */
function failedContractCode(final: rpc.Api.GetTransactionResponse): number | undefined {
  const events = (final as { diagnosticEventsXdr?: xdr.DiagnosticEvent[] }).diagnosticEventsXdr ?? [];
  let readable: ReturnType<typeof humanizeEvents>;
  try { readable = humanizeEvents(events); } catch { return undefined; }
  for (const event of readable) {
    for (const value of [...event.topics, event.data]) {
      if (typeof value === "object" && value !== null && (value as { type?: unknown }).type === "contract") {
        const code = (value as { code?: unknown }).code;
        if (typeof code === "number" && Number.isInteger(code)) return code;
      }
    }
  }
  return undefined;
}

/** Read-only contract call through simulation; never signs or submits. */
export async function readContract(contractId: string, method: string, args: xdr.ScVal[], options: CallOptions = {}): Promise<unknown> {
  const server = options.server ?? defaultServer();
  let sim: rpc.Api.SimulateTransactionResponse;
  try {
    sim = await server.simulateTransaction(buildCall(new Account(SIMULATION_SOURCE, "0"), contractId, method, args));
  } catch {
    throw new ChainError("RPC_UNAVAILABLE", "No se pudo consultar la red de Stellar.");
  }
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw contractError((sim as { error?: unknown }).error, "El contrato rechazo la consulta.");
  }
  return scValToNative(sim.result.retval);
}

export interface Submitted {
  transactionHash: string;
  /** The contract function's return value, already converted to JS. */
  value: unknown;
}

/**
 * Prepares a call (simulation sets fees and authorizations), has `address` sign it in the
 * wallet, sends it and waits for the ledger to confirm it.
 */
export async function submitContractCall(
  address: string, contractId: string, method: string, args: xdr.ScVal[],
  signer: TransactionSigner | undefined, options: CallOptions, fallback: string,
): Promise<Submitted> {
  const source = validatePublicAddress(address);
  const server = options.server ?? defaultServer();
  const wallet = signer ?? await import("@stellar/freighter-api");
  let prepared: Transaction;
  try {
    const account = await server.getAccount(source);
    prepared = await server.prepareTransaction(buildCall(account, contractId, method, args));
  } catch (error) {
    throw contractError(error, fallback);
  }
  const signed = await wallet.signTransaction(prepared.toXDR(), {
    networkPassphrase: STELLAR_TESTNET.networkPassphrase, address: source,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new ChainError("WALLET_REJECTED", "La operacion no fue firmada.");
  }
  const tx = TransactionBuilder.fromXDR(signed.signedTxXdr, STELLAR_TESTNET.networkPassphrase) as Transaction;
  let sent: rpc.Api.SendTransactionResponse;
  try {
    sent = await server.sendTransaction(tx);
  } catch {
    throw new ChainError("RPC_UNAVAILABLE", "La red no respondio. Intenta nuevamente.");
  }
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new ChainError("RPC_UNAVAILABLE", "La red no acepto la operacion. Intenta nuevamente.");
  }
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
    throw new ChainError("PENDING", "La operación sigue pendiente en testnet.", undefined, sent.hash);
  }
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS) {
    const code = failedContractCode(final);
    if (code !== undefined) {
      throw new ChainError("CONTRACT_REJECTED", CONTRACT_MESSAGES[code] ?? fallback, code, sent.hash);
    }
    throw new ChainError("INVALID_RESPONSE", "La operación no se confirmó en testnet.", undefined, sent.hash);
  }
  return { transactionHash: sent.hash, value: final.returnValue ? scValToNative(final.returnValue) : undefined };
}
