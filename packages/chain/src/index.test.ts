import { describe, expect, it, vi } from "vitest";
import { assertTestnet, connectFreighterTestnet, probeTestnet, STELLAR_TESTNET, validatePublicAddress, type FreighterAdapter } from "./index.js";

const PUBLIC_ADDRESS = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const makeWallet = (overrides: Partial<FreighterAdapter> = {}): FreighterAdapter => ({
  isConnected: async () => ({ isConnected: true }),
  requestAccess: async () => ({ address: PUBLIC_ADDRESS }),
  getNetworkDetails: async () => ({ networkPassphrase: STELLAR_TESTNET.networkPassphrase }),
  ...overrides,
});
const makeFetch = (network: unknown = STELLAR_TESTNET.networkPassphrase, ledger: unknown = 1234): typeof fetch =>
  vi.fn(async (_url, init) => {
    const { method } = JSON.parse(String(init?.body)) as { method: string };
    const result = method === "getHealth"
      ? { status: "healthy", latestLedger: ledger }
      : { passphrase: network, protocolVersion: 28 };
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: method, result }));
  });

describe("public input validation", () => {
  it("accepts only testnet and checksum-valid public account addresses", () => {
    expect(() => assertTestnet(STELLAR_TESTNET.networkPassphrase)).not.toThrow();
    expect(validatePublicAddress(PUBLIC_ADDRESS)).toBe(PUBLIC_ADDRESS);
    expect(() => assertTestnet("Public Global Stellar Network ; September 2015")).toThrow();
    expect(() => validatePublicAddress("G".repeat(56))).toThrow();
    expect(() => validatePublicAddress(null)).toThrow();
  });
});

describe("read-only RPC probe", () => {
  it("checks health and the actual network passphrase", async () => {
    expect(await probeTestnet({ fetch: makeFetch() })).toEqual({
      status: "healthy", latestLedger: 1234, protocolVersion: 28,
      networkPassphrase: STELLAR_TESTNET.networkPassphrase,
    });
  });
  it("rejects a node connected to another network", async () => {
    await expect(probeTestnet({ fetch: makeFetch("another network") })).rejects.toMatchObject({ code: "NETWORK_MISMATCH" });
  });
  it("rejects malformed ledger values", async () => {
    await expect(probeTestnet({ fetch: makeFetch(undefined, "1234") })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("rejects JSON-RPC errors without exposing the provider payload", async () => {
    const fetcher: typeof fetch = vi.fn(async () => new Response(JSON.stringify({ jsonrpc: "2.0", id: "getHealth", error: { message: "private detail" } })));
    await expect(probeTestnet({ fetch: fetcher })).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
  it("reports network failures", async () => {
    const fetcher: typeof fetch = vi.fn(async () => { throw new Error("offline"); });
    await expect(probeTestnet({ fetch: fetcher })).rejects.toMatchObject({ code: "RPC_UNAVAILABLE" });
  });
});

describe("Freighter connection", () => {
  it("returns only the public address and validated network", async () => {
    expect(await connectFreighterTestnet(makeWallet())).toEqual({ address: PUBLIC_ADDRESS, network: "TESTNET" });
  });
  it("rejects mainnet even if the address was shared", async () => {
    await expect(connectFreighterTestnet(makeWallet({
      getNetworkDetails: async () => ({ networkPassphrase: "Public Global Stellar Network ; September 2015" }),
    }))).rejects.toMatchObject({ code: "NETWORK_MISMATCH" });
  });
  it("stops before requesting access when the extension is unavailable", async () => {
    const requestAccess = vi.fn(async () => ({ address: PUBLIC_ADDRESS }));
    await expect(connectFreighterTestnet(makeWallet({
      isConnected: async () => ({ isConnected: false }), requestAccess,
    }))).rejects.toMatchObject({ code: "WALLET_UNAVAILABLE" });
    expect(requestAccess).not.toHaveBeenCalled();
  });
  it("reports rejected wallet access", async () => {
    await expect(connectFreighterTestnet(makeWallet({
      requestAccess: async () => ({ address: "", error: { code: -1 } }),
    }))).rejects.toMatchObject({ code: "WALLET_REJECTED" });
  });
});
