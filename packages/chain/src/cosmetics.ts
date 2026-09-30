import {
  Account, Address, BASE_FEE, Contract, nativeToScVal, rpc, scValToNative, TransactionBuilder,
  type Transaction, type xdr,
} from "@stellar/stellar-sdk";
import { ChainError, STELLAR_TESTNET, validatePublicAddress } from "./index.js";

/** Public record of the testnet deployment (contracts/deployments/testnet.json). */
export const COSMETICS_TESTNET = Object.freeze({
  contractId: "CCLRN6UTKQ7NLZTDSBDSPCEKQ5JBVEUYQUDF3FDBCXMWJ6E7HXYNHEKD",
  /** Existing account used only as the source of read-only simulations. */
  simulationSource: "GBKNU5OIKQ4F6GYBSHLFYFXBVJ57BU5G7MSRP2UKWM3R5WSKB6Z3M5GQ",
});

export type CosmeticSlot = "livery" | "trail" | "emblem";
export type CosmeticFamily = "merit" | "veteran" | "collection";

export interface DemoCosmetic {
  classId: number;
  key: string;
  slot: CosmeticSlot;
  family: CosmeticFamily;
  /** Price in stroops (1 XLM = 10,000,000). 0 means reward only. */
  priceStroops: bigint;
  metadataUri: string;
}

/** Brief v0.4 demo catalog, created on chain by scripts/deploy-testnet.mjs. */
export const DEMO_COSMETICS: readonly DemoCosmetic[] = Object.freeze([
  { classId: 1, key: "aurora-andina", slot: "livery", family: "collection", priceStroops: 50_000_000n, metadataUri: "/cosmetics/aurora-andina.json" },
  { classId: 2, key: "pulso-violeta", slot: "trail", family: "collection", priceStroops: 30_000_000n, metadataUri: "/cosmetics/pulso-violeta.json" },
  { classId: 3, key: "primera-victoria", slot: "emblem", family: "merit", priceStroops: 0n, metadataUri: "/cosmetics/primera-victoria.json" },
  { classId: 4, key: "exploracion", slot: "emblem", family: "merit", priceStroops: 0n, metadataUri: "/cosmetics/exploracion.json" },
]);

export interface OwnedCosmetic {
  tokenId: number;
  classId: number;
}

/** Subset of rpc.Server used here, so tests can inject a double. */
export interface CosmeticsRpc {
  getAccount(address: string): Promise<Account>;
  simulateTransaction(tx: Transaction): Promise<rpc.Api.SimulateTransactionResponse>;
  prepareTransaction(tx: Transaction): Promise<Transaction>;
  sendTransaction(tx: Transaction): Promise<rpc.Api.SendTransactionResponse>;
  pollTransaction(hash: string, opts?: rpc.Server.PollingOptions): Promise<rpc.Api.GetTransactionResponse>;
}

export interface TransactionSigner {
  signTransaction(xdr: string, opts: { networkPassphrase: string; address: string }): Promise<{ signedTxXdr: string; error?: unknown }>;
}

export interface CosmeticsOptions {
  server?: CosmeticsRpc;
  contractId?: string;
}

const defaultServer = (): CosmeticsRpc => new rpc.Server(STELLAR_TESTNET.rpcUrl) as unknown as CosmeticsRpc;

function validU32(classId: unknown): number {
  if (typeof classId !== "number" || !Number.isInteger(classId) || classId < 0 || classId > 0xffff_ffff) {
    throw new ChainError("INVALID_RESPONSE", "Identificador invalido en la respuesta del contrato.");
  }
  return classId;
}

function buildCall(source: Account, contractId: string, method: string, args: xdr.ScVal[]): Transaction {
  return new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: STELLAR_TESTNET.networkPassphrase })
    .addOperation(new Contract(contractId).call(method, ...args))
    .setTimeout(60)
    .build();
}

/** Read-only contract call through simulation; never signs or submits. */
async function read(method: string, args: xdr.ScVal[], options: CosmeticsOptions): Promise<unknown> {
  const server = options.server ?? defaultServer();
  const source = new Account(COSMETICS_TESTNET.simulationSource, "0");
  let sim: rpc.Api.SimulateTransactionResponse;
  try {
    sim = await server.simulateTransaction(buildCall(source, options.contractId ?? COSMETICS_TESTNET.contractId, method, args));
  } catch {
    throw new ChainError("RPC_UNAVAILABLE", "No se pudo consultar el contrato de cosmeticos.");
  }
  if (!rpc.Api.isSimulationSuccess(sim) || !sim.result) {
    throw new ChainError("INVALID_RESPONSE", "El contrato de cosmeticos rechazo la consulta.");
  }
  return scValToNative(sim.result.retval);
}

/** Every piece the address owns, for the hangar. Does not require a wallet. */
export async function ownedCosmetics(owner: string, options: CosmeticsOptions = {}): Promise<OwnedCosmetic[]> {
  const address = new Address(validatePublicAddress(owner)).toScVal();
  const ids = await read("tokens_of", [address], options);
  if (!Array.isArray(ids)) throw new ChainError("INVALID_RESPONSE", "Inventario invalido.");
  const tokens = ids.map((id) => validU32(id)).sort((a, b) => a - b);
  const classes = await Promise.all(tokens.map((id) => read("class_of", [nativeToScVal(id, { type: "u32" })], options)));
  return tokens.map((tokenId, i) => ({ tokenId, classId: validU32(classes[i]) }));
}

/** What the server checks before accepting an equipped piece. */
export async function ownsCosmeticClass(owner: string, classId: number, options: CosmeticsOptions = {}): Promise<boolean> {
  const result = await read("has_class", [
    new Address(validatePublicAddress(owner)).toScVal(),
    nativeToScVal(validU32(classId), { type: "u32" }),
  ], options);
  if (typeof result !== "boolean") throw new ChainError("INVALID_RESPONSE", "Respuesta de propiedad invalida.");
  return result;
}

export interface Purchase {
  tokenId: number;
  transactionHash: string;
}

/** Primary sale signed by the player in Freighter. Payment goes to the treasury. */
export async function buyCosmetic(
  buyer: string, classId: number, signer?: TransactionSigner, options: CosmeticsOptions = {},
): Promise<Purchase> {
  const address = validatePublicAddress(buyer);
  const server = options.server ?? defaultServer();
  const wallet = signer ?? await import("@stellar/freighter-api");
  let prepared: Transaction;
  try {
    const account = await server.getAccount(address);
    prepared = await server.prepareTransaction(buildCall(account, options.contractId ?? COSMETICS_TESTNET.contractId, "buy", [
      new Address(address).toScVal(), nativeToScVal(validU32(classId), { type: "u32" }),
    ]));
  } catch (error) {
    if (error instanceof ChainError) throw error;
    throw new ChainError("INVALID_RESPONSE", "No se pudo preparar la compra. Revisa tu saldo en testnet.");
  }
  const signed = await wallet.signTransaction(prepared.toXDR(), {
    networkPassphrase: STELLAR_TESTNET.networkPassphrase, address,
  });
  if (signed.error || !signed.signedTxXdr) {
    throw new ChainError("WALLET_REJECTED", "La compra no fue firmada.");
  }
  const tx = TransactionBuilder.fromXDR(signed.signedTxXdr, STELLAR_TESTNET.networkPassphrase) as Transaction;
  const sent = await server.sendTransaction(tx);
  if (sent.status === "ERROR" || sent.status === "TRY_AGAIN_LATER") {
    throw new ChainError("RPC_UNAVAILABLE", "La red no acepto la compra. Intenta nuevamente.");
  }
  const final = await server.pollTransaction(sent.hash, { attempts: 30 });
  if (final.status !== rpc.Api.GetTransactionStatus.SUCCESS || !final.returnValue) {
    throw new ChainError("INVALID_RESPONSE", "La compra no se confirmo en testnet.");
  }
  return { tokenId: validU32(scValToNative(final.returnValue)), transactionHash: sent.hash };
}
