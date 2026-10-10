import { readFileSync } from "node:fs";
import { Account, nativeToScVal, rpc, xdr, type Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  buyCosmetic, COSMETICS_TESTNET, DEMO_COSMETICS, MARKETPLACE_TESTNET, ownedCosmetics, ownsCosmeticClass,
  type CosmeticsRpc, type TransactionSigner,
} from "./index.js";

const PLAYER = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";

// Read the invocation through its JSON form, which is stable across XDR API styles.
interface Invocation { function_name: string; args: { u32?: number }[] }
const invocation = (tx: Transaction): Invocation =>
  (JSON.parse(JSON.stringify((tx.operations[0] as unknown as { func: unknown }).func)) as { invoke_contract: Invocation }).invoke_contract;
const methodOf = (tx: Transaction): string => invocation(tx).function_name;
const argAt = (tx: Transaction, i: number): unknown => invocation(tx).args[i]?.u32;
const u32 = (n: number) => nativeToScVal(n, { type: "u32" });

const success = (retval: xdr.ScVal) =>
  ({ transactionData: {}, result: { retval }, latestLedger: 1 }) as unknown as rpc.Api.SimulateTransactionResponse;

function fakeServer(overrides: Partial<CosmeticsRpc> = {}): CosmeticsRpc {
  return {
    getAccount: async (address) => new Account(address, "1"),
    getLatestLedger: async () => ({ sequence: 1_000 }),
    simulateTransaction: async (tx) => {
      switch (methodOf(tx)) {
        case "tokens_of": return success(xdr.ScVal.scvVec([u32(9), u32(4)]));
        case "class_of": return success(u32(argAt(tx, 0) === 4 ? 3 : 1));
        case "has_class": return success(nativeToScVal(argAt(tx, 1) === 1));
        default: throw new Error("unexpected method");
      }
    },
    prepareTransaction: async (tx) => tx,
    sendTransaction: async () => ({ status: "PENDING", hash: "ab".repeat(32) }) as rpc.Api.SendTransactionResponse,
    pollTransaction: async () => ({
      status: rpc.Api.GetTransactionStatus.SUCCESS, returnValue: nativeToScVal(7, { type: "u32" }),
    }) as rpc.Api.GetTransactionResponse,
    ...overrides,
  };
}

const passthroughSigner: TransactionSigner = { signTransaction: async (x) => ({ signedTxXdr: x }) };

/** The diagnostic event a contract leaves when it fails with `Error(Contract, #code)`. */
function contractErrorEvent(code: number): xdr.DiagnosticEvent {
  return new xdr.DiagnosticEvent({
    inSuccessfulContractCall: false,
    event: new xdr.ContractEvent({
      ext: xdr.ExtensionPoint.v0(),
      contractId: null,
      type: xdr.ContractEventType.diagnostic,
      body: xdr.ContractEventBody.v0(new xdr.ContractEventV0({
        topics: [xdr.ScVal.scvSymbol("error"), xdr.ScVal.scvError(xdr.ScError.sceContract(code))],
        data: xdr.ScVal.scvString("escalating error to VM trap"),
      })),
    }),
  });
}

describe("cosmetics reads", () => {
  it("lists owned pieces sorted by token with their class", async () => {
    expect(await ownedCosmetics(PLAYER, { server: fakeServer() })).toEqual([
      { tokenId: 4, classId: 3 },
      { tokenId: 9, classId: 1 },
    ]);
  });

  it("checks class ownership for equipment", async () => {
    const server = fakeServer();
    expect(await ownsCosmeticClass(PLAYER, 1, { server })).toBe(true);
    expect(await ownsCosmeticClass(PLAYER, 2, { server })).toBe(false);
  });

  it("rejects invalid addresses and failed or unreachable simulations", async () => {
    await expect(ownedCosmetics("G".repeat(56), { server: fakeServer() })).rejects.toMatchObject({ code: "INVALID_ADDRESS" });
    const failing = fakeServer({ simulateTransaction: async () => ({ error: "HostError" }) as unknown as rpc.Api.SimulateTransactionResponse });
    await expect(ownsCosmeticClass(PLAYER, 1, { server: failing })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    const down = fakeServer({ simulateTransaction: async () => { throw new Error("offline"); } });
    await expect(ownsCosmeticClass(PLAYER, 1, { server: down })).rejects.toMatchObject({ code: "RPC_UNAVAILABLE" });
  });
});

describe("cosmetics purchase", () => {
  it("prepares, signs with the buyer address and returns the minted token", async () => {
    let signedFor: string | undefined;
    const signer: TransactionSigner = { signTransaction: async (x, opts) => { signedFor = opts.address; return { signedTxXdr: x }; } };
    expect(await buyCosmetic(PLAYER, 1, signer, { server: fakeServer() })).toEqual({ tokenId: 7, transactionHash: "ab".repeat(32) });
    expect(signedFor).toBe(PLAYER);
  });

  it("stops when the player declines to sign", async () => {
    const declined: TransactionSigner = { signTransaction: async () => ({ signedTxXdr: "", error: "User declined" }) };
    await expect(buyCosmetic(PLAYER, 1, declined, { server: fakeServer() })).rejects.toMatchObject({ code: "WALLET_REJECTED" });
  });

  it("reports a failed confirmation instead of a fake token", async () => {
    const server = fakeServer({ pollTransaction: async () => ({ status: rpc.Api.GetTransactionStatus.FAILED }) as rpc.Api.GetTransactionResponse });
    await expect(buyCosmetic(PLAYER, 1, passthroughSigner, { server }))
      .rejects.toMatchObject({ code: "INVALID_RESPONSE", transactionHash: "ab".repeat(32) });
  });

  it("calls a transaction still unseen after polling pending, with its hash", async () => {
    const server = fakeServer({ pollTransaction: async () => ({ status: rpc.Api.GetTransactionStatus.NOT_FOUND }) as rpc.Api.GetTransactionResponse });
    await expect(buyCosmetic(PLAYER, 1, passthroughSigner, { server }))
      .rejects.toMatchObject({ name: "ChainError", code: "PENDING", transactionHash: "ab".repeat(32) });
  });

  it("names the contract refusal of a failed transaction from its diagnostic events", async () => {
    const server = fakeServer({
      pollTransaction: async () => ({
        status: rpc.Api.GetTransactionStatus.FAILED, diagnosticEventsXdr: [contractErrorEvent(8)],
      }) as unknown as rpc.Api.GetTransactionResponse,
    });
    await expect(buyCosmetic(PLAYER, 1, passthroughSigner, { server })).rejects.toMatchObject({
      code: "CONTRACT_REJECTED", contractCode: 8, message: "Esta pieza se agotó.", transactionHash: "ab".repeat(32),
    });
  });
});

describe("demo catalog", () => {
  it("matches the public testnet deployment record", () => {
    const record = JSON.parse(readFileSync(new URL("../../../contracts/deployments/testnet.json", import.meta.url), "utf8")) as {
      contractId: string; contractVersion: number; classes: { id: number; key: string; priceStroops: string }[];
      marketplace: { contractId: string; feeBps: number };
    };
    expect(COSMETICS_TESTNET.contractId).toBe(record.contractId);
    expect(COSMETICS_TESTNET.contractVersion).toBe(record.contractVersion);
    expect(MARKETPLACE_TESTNET.contractId).toBe(record.marketplace.contractId);
    expect(MARKETPLACE_TESTNET.feeBps).toBe(record.marketplace.feeBps);
    expect(DEMO_COSMETICS.map((c) => [c.classId, c.key, String(c.priceStroops)]))
      .toEqual(record.classes.map((c) => [c.id, c.key, c.priceStroops]));
  });
});
