import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { ChainError, validatePublicAddress } from "./index.js";
import {
  readContract, submitContractCall, validU32,
  type CallOptions, type ChainRpc, type TransactionSigner,
} from "./call.js";

/** Public record of the testnet deployment (contracts/deployments/testnet.json). */
export const COSMETICS_TESTNET = Object.freeze({
  contractId: "CBKQMFOSP2RFRXL6KQH3VTLVOKJCUU6K3XJLRNEUJHJJM7AZT2JSLA6L",
  contractVersion: 4,
  /** Existing account used only as the source of read-only simulations. */
  simulationSource: "GBKNU5OIKQ4F6GYBSHLFYFXBVJ57BU5G7MSRP2UKWM3R5WSKB6Z3M5GQ",
});

export type CosmeticSlot = "livery" | "trail" | "emblem" | "announcer" | "music";
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

/** On-chain catalog (contract v4), created by scripts/deploy-testnet.mjs. */
export const DEMO_COSMETICS: readonly DemoCosmetic[] = Object.freeze([
  { classId: 1, key: "aurora-andina", slot: "livery", family: "collection", priceStroops: 50_000_000n, metadataUri: "/cosmetics/aurora-andina.json" },
  { classId: 2, key: "pulso-violeta", slot: "trail", family: "collection", priceStroops: 30_000_000n, metadataUri: "/cosmetics/pulso-violeta.json" },
  { classId: 3, key: "primera-victoria", slot: "emblem", family: "merit", priceStroops: 0n, metadataUri: "/cosmetics/primera-victoria.json" },
  { classId: 4, key: "exploracion", slot: "emblem", family: "merit", priceStroops: 0n, metadataUri: "/cosmetics/exploracion.json" },
  { classId: 5, key: "voz-analista", slot: "announcer", family: "collection", priceStroops: 40_000_000n, metadataUri: "/cosmetics/voz-analista.json" },
  { classId: 6, key: "musica-gravity-final-path", slot: "music", family: "collection", priceStroops: 20_000_000n, metadataUri: "/cosmetics/musica-gravity-final-path.json" },
]);

/** Merit keys the game awards, mapped to their on-chain class. */
export const MERIT_CLASSES: Readonly<Record<string, number>> = Object.freeze({ "primera-victoria": 3, exploracion: 4 });

export interface OwnedCosmetic {
  tokenId: number;
  classId: number;
}

/** @deprecated Use ChainRpc; kept for callers written against the first client. */
export type CosmeticsRpc = ChainRpc;
export type CosmeticsOptions = CallOptions;
export type { TransactionSigner };

const contractOf = (options: CallOptions) => options.contractId ?? COSMETICS_TESTNET.contractId;
const read = (method: string, args: Parameters<typeof readContract>[2], options: CallOptions) =>
  readContract(contractOf(options), method, args, options);

/** Every piece the address owns, for the hangar. Does not require a wallet. */
export async function ownedCosmetics(owner: string, options: CallOptions = {}): Promise<OwnedCosmetic[]> {
  const address = new Address(validatePublicAddress(owner)).toScVal();
  const ids = await read("tokens_of", [address], options);
  if (!Array.isArray(ids)) throw new ChainError("INVALID_RESPONSE", "Inventario invalido.");
  const tokens = ids.map((id) => validU32(id)).sort((a, b) => a - b);
  const classes = await Promise.all(tokens.map((id) => read("class_of", [nativeToScVal(id, { type: "u32" })], options)));
  return tokens.map((tokenId, i) => ({ tokenId, classId: validU32(classes[i]) }));
}

/** What the server checks before accepting an equipped piece. */
export async function ownsCosmeticClass(owner: string, classId: number, options: CallOptions = {}): Promise<boolean> {
  const result = await read("has_class", [
    new Address(validatePublicAddress(owner)).toScVal(),
    nativeToScVal(validU32(classId), { type: "u32" }),
  ], options);
  if (typeof result !== "boolean") throw new ChainError("INVALID_RESPONSE", "Respuesta de propiedad invalida.");
  return result;
}

/** Whether a reward id was already granted, so the server never pays twice. */
export async function isRewardClaimed(rewardId: Uint8Array, options: CallOptions = {}): Promise<boolean> {
  if (rewardId.length !== 32) throw new ChainError("INVALID_RESPONSE", "Identificador de premio invalido.");
  const result = await read("is_reward_claimed", [nativeToScVal(Buffer.from(rewardId), { type: "bytes" })], options);
  if (typeof result !== "boolean") throw new ChainError("INVALID_RESPONSE", "Respuesta de premio invalida.");
  return result;
}

export interface Purchase {
  tokenId: number;
  transactionHash: string;
}

/** Primary sale signed by the player in Freighter. Payment goes to the treasury. */
export async function buyCosmetic(
  buyer: string, classId: number, signer?: TransactionSigner, options: CallOptions = {},
): Promise<Purchase> {
  const address = validatePublicAddress(buyer);
  const result = await submitContractCall(address, contractOf(options), "buy", [
    new Address(address).toScVal(), nativeToScVal(validU32(classId), { type: "u32" }),
  ], signer, options, "No se pudo completar la compra. Revisa tu saldo en testnet.");
  return { tokenId: validU32(result.value), transactionHash: result.transactionHash };
}
