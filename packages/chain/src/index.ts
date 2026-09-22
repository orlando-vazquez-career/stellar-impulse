import { StrKey } from "@stellar/stellar-sdk";

export const STELLAR_TESTNET = Object.freeze({
  network: "TESTNET" as const,
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
  explorerUrl: "https://stellar.expert/explorer/testnet",
});

export type ChainErrorCode =
  | "RPC_UNAVAILABLE"
  | "INVALID_RESPONSE"
  | "NETWORK_MISMATCH"
  | "WALLET_UNAVAILABLE"
  | "WALLET_REJECTED"
  | "INVALID_ADDRESS";

export class ChainError extends Error {
  constructor(public readonly code: ChainErrorCode, message: string) {
    super(message);
    this.name = "ChainError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function assertTestnet(passphrase: unknown): void {
  if (passphrase !== STELLAR_TESTNET.networkPassphrase) {
    throw new ChainError("NETWORK_MISMATCH", "Selecciona Stellar Testnet en tu wallet.");
  }
}

export function validatePublicAddress(value: unknown): string {
  if (typeof value !== "string" || !StrKey.isValidEd25519PublicKey(value)) {
    throw new ChainError("INVALID_ADDRESS", "La wallet no devolvio una direccion publica Stellar valida.");
  }
  return value;
}

export interface TestnetStatus {
  status: "healthy";
  latestLedger: number;
  protocolVersion: number;
  networkPassphrase: string;
}

export interface ProbeOptions {
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

async function rpc(method: "getHealth" | "getNetwork", options: ProbeOptions): Promise<Record<string, unknown>> {
  const timeout = AbortSignal.timeout(10_000);
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  let response: Response;
  try {
    response = await (options.fetch ?? globalThis.fetch)(STELLAR_TESTNET.rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: method, method }),
      signal,
    });
  } catch {
    throw new ChainError("RPC_UNAVAILABLE", "No se pudo consultar Stellar Testnet. Intenta nuevamente.");
  }
  if (!response.ok) {
    throw new ChainError("RPC_UNAVAILABLE", "Stellar Testnet no esta disponible temporalmente.");
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ChainError("INVALID_RESPONSE", "Stellar RPC devolvio una respuesta invalida.");
  }
  if (!isRecord(body) || body.jsonrpc !== "2.0" || body.id !== method || "error" in body || !isRecord(body.result)) {
    throw new ChainError("INVALID_RESPONSE", "Stellar RPC devolvio una respuesta invalida.");
  }
  return body.result;
}

/** Read-only probe: does not request a wallet, fund an account or submit transactions. */
export async function probeTestnet(options: ProbeOptions = {}): Promise<TestnetStatus> {
  const [health, network] = await Promise.all([rpc("getHealth", options), rpc("getNetwork", options)]);
  assertTestnet(network.passphrase);
  if (health.status !== "healthy" || !positiveInteger(health.latestLedger) || !positiveInteger(network.protocolVersion)) {
    throw new ChainError("INVALID_RESPONSE", "Stellar RPC no confirmo un estado de red valido.");
  }
  return {
    status: "healthy",
    latestLedger: health.latestLedger,
    protocolVersion: network.protocolVersion,
    networkPassphrase: STELLAR_TESTNET.networkPassphrase,
  };
}

export interface FreighterAdapter {
  isConnected(): Promise<{ isConnected: boolean; error?: unknown }>;
  requestAccess(): Promise<{ address: string; error?: unknown }>;
  getNetworkDetails(): Promise<{ networkPassphrase: string; error?: unknown }>;
}

export interface WalletConnection {
  address: string;
  network: "TESTNET";
}

/** Permission to read a public address only. This is not an authenticated game session. */
export async function connectFreighterTestnet(adapter?: FreighterAdapter): Promise<WalletConnection> {
  const wallet = adapter ?? await import("@stellar/freighter-api");
  const available = await wallet.isConnected();
  if (available.error || !available.isConnected) {
    throw new ChainError("WALLET_UNAVAILABLE", "Instala o habilita Freighter para conectar tu wallet.");
  }
  const access = await wallet.requestAccess();
  if (access.error || !access.address) {
    throw new ChainError("WALLET_REJECTED", "No se autorizo la conexion con la wallet.");
  }
  const details = await wallet.getNetworkDetails();
  if (details.error) {
    throw new ChainError("WALLET_UNAVAILABLE", "No se pudo comprobar la red de Freighter.");
  }
  assertTestnet(details.networkPassphrase);
  return { address: validatePublicAddress(access.address), network: "TESTNET" };
}
