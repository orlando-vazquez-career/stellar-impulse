import { Account, Asset, BASE_FEE, Keypair, nativeToScVal, Operation, rpc, TransactionBuilder, type Transaction } from "@stellar/stellar-sdk";
import { describe, expect, it } from "vitest";
import {
  createWalletChallenge, grantReward, keypairSigner, meritRewardId, signWalletChallenge, STELLAR_TESTNET,
  verifyWalletChallenge, type ChainRpc,
} from "./index.js";

const serverKey = Keypair.random();
const player = Keypair.random();
const stranger = Keypair.random();

describe("wallet link (SEP-10)", () => {
  it("accepts a challenge signed by the player's wallet", async () => {
    const challenge = createWalletChallenge(serverKey, player.publicKey());
    const signed = await signWalletChallenge(challenge, player.publicKey(), keypairSigner(player));
    expect(verifyWalletChallenge(signed, serverKey.publicKey(), player.publicKey())).toBe(player.publicKey());
  });

  it("rejects a challenge signed by someone else or for another address", async () => {
    const challenge = createWalletChallenge(serverKey, player.publicKey());
    const forged = await keypairSigner(stranger).signTransaction(challenge.transaction, {
      networkPassphrase: STELLAR_TESTNET.networkPassphrase, address: stranger.publicKey(),
    });
    expect(() => verifyWalletChallenge(forged.signedTxXdr, serverKey.publicKey(), player.publicKey())).toThrow(/no es valida/);
    const signed = await signWalletChallenge(challenge, player.publicKey(), keypairSigner(player));
    expect(() => verifyWalletChallenge(signed, serverKey.publicKey(), stranger.publicKey())).toThrow(/no es valida/);
    // A challenge made by another server key is not ours.
    expect(() => verifyWalletChallenge(signed, Keypair.random().publicKey(), player.publicKey())).toThrow(/no es valida/);
  });

  it("never asks the wallet to sign something that is not a login challenge", async () => {
    const payment = new TransactionBuilder(new Account(serverKey.publicKey(), "10"), {
      fee: BASE_FEE, networkPassphrase: STELLAR_TESTNET.networkPassphrase,
    }).addOperation(Operation.payment({ destination: serverKey.publicKey(), asset: Asset.native(), amount: "100" }))
      .setTimeout(60).build();
    let asked = false;
    const wallet = { signTransaction: async (x: string) => { asked = true; return { signedTxXdr: x }; } };
    await expect(signWalletChallenge({
      transaction: payment.toXDR(), serverAccountId: serverKey.publicKey(), networkPassphrase: STELLAR_TESTNET.networkPassphrase,
    }, player.publicKey(), wallet)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(asked).toBe(false);
  });
});

describe("merit rewards", () => {
  it("derives one fixed reward id per account and merit", () => {
    const a = meritRewardId("acc-1", "primera-victoria", "C1");
    expect(a).toHaveLength(32);
    expect(meritRewardId("acc-1", "primera-victoria", "C1")).toEqual(a);
    expect(meritRewardId("acc-2", "primera-victoria", "C1")).not.toEqual(a);
    expect(meritRewardId("acc-1", "exploracion", "C1")).not.toEqual(a);
  });

  it("signs the grant with the minter key and returns the token", async () => {
    const minter = Keypair.random();
    let signedBy = "";
    const server: ChainRpc = {
      getAccount: async (address) => new Account(address, "5"),
      getLatestLedger: async () => ({ sequence: 1 }),
      simulateTransaction: async () => { throw new Error("unused"); },
      prepareTransaction: async (tx) => tx,
      sendTransaction: async (tx: Transaction) => {
        signedBy = tx.source;
        expect(tx.signatures).toHaveLength(1);
        return { status: "PENDING", hash: "ef".repeat(32) } as rpc.Api.SendTransactionResponse;
      },
      pollTransaction: async () => ({ status: rpc.Api.GetTransactionStatus.SUCCESS, returnValue: nativeToScVal(9, { type: "u32" }) }) as rpc.Api.GetTransactionResponse,
    };
    const result = await grantReward(minter, player.publicKey(), 3, meritRewardId("acc", "primera-victoria"), { server });
    expect(result).toEqual({ tokenId: 9, transactionHash: "ef".repeat(32) });
    expect(signedBy).toBe(minter.publicKey());
  });
});
