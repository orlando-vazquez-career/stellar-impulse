import { Account, Address, Keypair, nativeToScVal, rpc, xdr, type Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  buyCosmetic, buyListing, cancelListing, contractErrorMessage, listCosmetic, LISTING_DAYS, marketFee, marketListings,
  type ChainRpc, type TransactionSigner,
} from "./index.js";

const SELLER = Keypair.random().publicKey();
const BUYER = Keypair.random().publicKey();

interface Invocation { function_name: string; args: Record<string, unknown>[] }
const invocation = (tx: Transaction): Invocation =>
  (JSON.parse(JSON.stringify((tx.operations[0] as unknown as { func: unknown }).func)) as { invoke_contract: Invocation }).invoke_contract;
const u32 = (n: number) => nativeToScVal(n, { type: "u32" });
const success = (retval: xdr.ScVal) =>
  ({ transactionData: {}, result: { retval }, latestLedger: 1 }) as unknown as rpc.Api.SimulateTransactionResponse;

function listingVal(id: number, price: bigint) {
  return nativeToScVal({
    active: true, class_id: 1, listing_id: id, live_until_ledger: 2_000, price, seller: new Address(SELLER), token_id: 10 + id,
  }, { type: { active: ["symbol", "bool"], class_id: ["symbol", "u32"], listing_id: ["symbol", "u32"], live_until_ledger: ["symbol", "u32"], price: ["symbol", "i128"], seller: ["symbol", "address"], token_id: ["symbol", "u32"] } });
}

function fakeServer(pages: number[][], overrides: Partial<ChainRpc> = {}) {
  const calls: { method: string; args: Record<string, unknown>[] }[] = [];
  let page = 0;
  const server: ChainRpc = {
    getAccount: async (address) => new Account(address, "1"),
    getLatestLedger: async () => ({ sequence: 1_000 }),
    simulateTransaction: async (tx) => {
      const call = invocation(tx);
      calls.push({ method: call.function_name, args: call.args });
      if (call.function_name === "next_listing_id") return success(u32(500));
      if (call.function_name === "listings") return success(xdr.ScVal.scvVec((pages[page++] ?? []).map((id) => listingVal(id, 20_000_000n))));
      throw new Error("unexpected method");
    },
    prepareTransaction: async (tx) => { const call = invocation(tx); calls.push({ method: call.function_name, args: call.args }); return tx; },
    sendTransaction: async () => ({ status: "PENDING", hash: "cd".repeat(32) }) as rpc.Api.SendTransactionResponse,
    pollTransaction: async () => ({ status: rpc.Api.GetTransactionStatus.SUCCESS, returnValue: u32(42) }) as rpc.Api.GetTransactionResponse,
    ...overrides,
  };
  return { server, calls };
}

const signer: TransactionSigner = { signTransaction: async (x) => ({ signedTxXdr: x }) };

describe("market listings", () => {
  it("reads open listings as typed offers", async () => {
    const { server } = fakeServer([[1, 2]]);
    const listings = await marketListings({ server });
    expect(listings).toEqual([
      { listingId: 1, seller: SELLER, tokenId: 11, classId: 1, priceStroops: 20_000_000n, liveUntilLedger: 2_000 },
      { listingId: 2, seller: SELLER, tokenId: 12, classId: 1, priceStroops: 20_000_000n, liveUntilLedger: 2_000 },
    ]);
  });

  it("moves to the next window of ids after a short page", async () => {
    const { server, calls } = fakeServer([[3], [95]]);
    const listings = await marketListings({ server, maxPages: 2 });
    expect(listings.map((l) => l.listingId)).toEqual([3, 95]);
    const starts = calls.filter((c) => c.method === "listings").map((c) => c.args[0]?.u32);
    expect(starts).toEqual([0, 90]);
  });
});

describe("market actions", () => {
  it("lists for the default duration and returns the listing id", async () => {
    const { server, calls } = fakeServer([]);
    expect(await listCosmetic(SELLER, 7, 25_000_000n, signer, { server })).toEqual({ listingId: 42, transactionHash: "cd".repeat(32) });
    const list = calls.find((c) => c.method === "list")!;
    expect(list.args[1]?.u32).toBe(7);
    expect(list.args[3]?.u32).toBe(1_000 + LISTING_DAYS * 17_280);
  });

  it("refuses a non-positive price before asking the wallet", async () => {
    let asked = false;
    const watching: TransactionSigner = { signTransaction: async (x) => { asked = true; return { signedTxXdr: x }; } };
    await expect(listCosmetic(SELLER, 7, 0n, watching, { server: fakeServer([]).server })).rejects.toMatchObject({ contractCode: 106 });
    expect(asked).toBe(false);
  });

  it("buys with the price the player saw as the maximum and cancels", async () => {
    const { server, calls } = fakeServer([]);
    await buyListing(BUYER, 3, 20_000_000n, signer, { server });
    await cancelListing(SELLER, 3, signer, { server });
    expect(calls.map((c) => c.method)).toEqual(["buy", "cancel"]);
  });

  it("explains contract refusals in the player's language", async () => {
    const refused = fakeServer([], { prepareTransaction: async () => { throw new Error("HostError: Error(Contract, #102)"); } });
    await expect(buyListing(BUYER, 3, 1n, signer, { server: refused.server }))
      .rejects.toMatchObject({ code: "CONTRACT_REJECTED", contractCode: 102, message: "El anuncio ya no esta disponible." });
    const unfunded = fakeServer([], { getAccount: async () => { throw new Error("Account not found: G..."); } });
    await expect(buyCosmetic(BUYER, 1, signer, { server: unfunded.server })).rejects.toMatchObject({ code: "UNFUNDED_ACCOUNT" });
    expect(contractErrorMessage(105)).toBe("El vendedor ya no tiene esta pieza.");
  });

  it("computes the 5% fee like the contract", () => {
    expect(marketFee(20_000_000n)).toBe(1_000_000n);
    expect(marketFee(999n)).toBe(49n);
  });
});
