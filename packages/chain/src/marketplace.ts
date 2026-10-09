import { Address, nativeToScVal } from "@stellar/stellar-sdk";
import { ChainError, validatePublicAddress } from "./index.js";
import {
  defaultServer, readContract, submitContractCall, validU32,
  type CallOptions, type TransactionSigner,
} from "./call.js";

/** Public record of the testnet deployment (contracts/deployments/testnet.json → marketplace). */
export const MARKETPLACE_TESTNET = Object.freeze({
  contractId: "CDB77C2EVQFHI6DNOK7Q7FZNJ6OMRRONMS5EI5BLIKV3UMENYE7NQ53C",
  contractVersion: 1,
  /** 5 %: the treasury's share of each sale. */
  feeBps: 500,
});

const DAY_IN_LEDGERS = 17_280;
/** A listing lasts 7 days (the contract allows up to 30); the seller can list again. */
export const LISTING_DAYS = 7;
/** The contract returns at most 30 listings per page and scans at most 90 ids per call. */
const PAGE = 30;
const SCAN_WINDOW = PAGE * 3;

export interface MarketListing {
  listingId: number;
  seller: string;
  tokenId: number;
  classId: number;
  /** Price in stroops paid by the buyer. */
  priceStroops: bigint;
  liveUntilLedger: number;
}

const contractOf = (options: CallOptions) => options.contractId ?? MARKETPLACE_TESTNET.contractId;
const u32 = (value: number) => nativeToScVal(validU32(value), { type: "u32" });
const i128 = (value: bigint) => nativeToScVal(value, { type: "i128" });

/** The fee the treasury keeps from a sale, rounded down like the contract does. */
export function marketFee(priceStroops: bigint, feeBps = MARKETPLACE_TESTNET.feeBps): bigint {
  return priceStroops * BigInt(feeBps) / 10_000n;
}

function parseListing(raw: unknown): MarketListing {
  if (typeof raw !== "object" || raw === null) throw new ChainError("INVALID_RESPONSE", "Anuncio invalido.");
  const value = raw as Record<string, unknown>;
  const price = value.price;
  if (typeof price !== "bigint" || price <= 0n || typeof value.seller !== "string") {
    throw new ChainError("INVALID_RESPONSE", "Anuncio invalido.");
  }
  return {
    listingId: validU32(value.listing_id),
    seller: validatePublicAddress(value.seller),
    tokenId: validU32(value.token_id),
    classId: validU32(value.class_id),
    priceStroops: price,
    liveUntilLedger: validU32(value.live_until_ledger),
  };
}

/** Open listings, oldest first. Reads up to `maxPages` pages of 30; never needs a wallet. */
export async function marketListings(options: CallOptions & { maxPages?: number } = {}): Promise<MarketListing[]> {
  const next = validU32(await readContract(contractOf(options), "next_listing_id", [], options));
  const found: MarketListing[] = [];
  let after = 0;
  for (let page = 0; page < (options.maxPages ?? 6) && after + 1 < next; page++) {
    const raw = await readContract(contractOf(options), "listings", [u32(after), u32(PAGE)], options);
    if (!Array.isArray(raw)) throw new ChainError("INVALID_RESPONSE", "Lista de anuncios invalida.");
    const listings = raw.map(parseListing);
    found.push(...listings);
    // A full page ends at its last listing; a short one means the contract scanned its whole
    // window of ids (closed listings included), so the next window starts after it.
    after = listings.length === PAGE ? listings.at(-1)!.listingId : after + SCAN_WINDOW;
  }
  return found;
}

/** The open listing of a piece, if any. */
export async function listingOfToken(tokenId: number, options: CallOptions = {}): Promise<number | null> {
  const raw = await readContract(contractOf(options), "listing_of_token", [u32(tokenId)], options);
  return raw === undefined || raw === null ? null : validU32(raw);
}

export interface MarketReceipt {
  transactionHash: string;
}

/**
 * Lists a collection piece. One signature in Freighter also lets the market move the piece
 * when it sells; the piece stays in the seller's wallet until then.
 */
export async function listCosmetic(
  seller: string, tokenId: number, priceStroops: bigint, signer?: TransactionSigner, options: CallOptions = {},
): Promise<MarketReceipt & { listingId: number }> {
  const address = validatePublicAddress(seller);
  if (priceStroops <= 0n) throw new ChainError("CONTRACT_REJECTED", "El precio tiene que ser mayor que cero.", 106);
  const server = options.server ?? defaultServer();
  let ledger: number;
  try {
    ledger = (await server.getLatestLedger()).sequence;
  } catch {
    throw new ChainError("RPC_UNAVAILABLE", "No se pudo consultar la red de Stellar.");
  }
  const result = await submitContractCall(address, contractOf(options), "list", [
    new Address(address).toScVal(), u32(tokenId), i128(priceStroops), u32(ledger + LISTING_DAYS * DAY_IN_LEDGERS),
  ], signer, { ...options, server }, "No se pudo publicar el anuncio.");
  return { listingId: validU32(result.value), transactionHash: result.transactionHash };
}

/** Buys a listing. `maxPriceStroops` is the price the player saw: a raised price is refused. */
export async function buyListing(
  buyer: string, listingId: number, maxPriceStroops: bigint, signer?: TransactionSigner, options: CallOptions = {},
): Promise<MarketReceipt> {
  const address = validatePublicAddress(buyer);
  const result = await submitContractCall(address, contractOf(options), "buy", [
    new Address(address).toScVal(), u32(listingId), i128(maxPriceStroops),
  ], signer, options, "No se pudo completar la compra. Revisa tu saldo en testnet.");
  return { transactionHash: result.transactionHash };
}

/** Withdraws a listing and the market's permission to move the piece. */
export async function cancelListing(
  seller: string, listingId: number, signer?: TransactionSigner, options: CallOptions = {},
): Promise<MarketReceipt> {
  const address = validatePublicAddress(seller);
  const result = await submitContractCall(address, contractOf(options), "cancel", [
    new Address(address).toScVal(), u32(listingId),
  ], signer, options, "No se pudo cancelar el anuncio.");
  return { transactionHash: result.transactionHash };
}
