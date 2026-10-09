import { Address, hash, Keypair, nativeToScVal, TransactionBuilder, WebAuth, type Transaction } from "@stellar/stellar-sdk";
import { ChainError, STELLAR_TESTNET, validatePublicAddress } from "./index.js";
import { submitContractCall, validU32, type CallOptions, type TransactionSigner } from "./call.js";
import { COSMETICS_TESTNET } from "./cosmetics.js";

/**
 * Wallet ↔ account link with a SEP-10 challenge: the server hands out a transaction that can
 * never execute (sequence 0, only manage_data), the wallet signs it, and the signature proves
 * the player controls the address. Signing it moves no funds.
 */
export const WALLET_LINK = Object.freeze({
  homeDomain: "impulso-stellar.game",
  webAuthDomain: "impulso-stellar.game",
  timeoutSeconds: 300,
});

export interface WalletChallenge {
  /** Base64 XDR of the challenge transaction. */
  transaction: string;
  /** The server key that signed it; the client checks the challenge against it. */
  serverAccountId: string;
  networkPassphrase: string;
}

/** Server: a fresh challenge for `address`, signed by the server key. */
export function createWalletChallenge(serverKeypair: Keypair, address: string): WalletChallenge {
  const client = validatePublicAddress(address);
  return {
    transaction: WebAuth.buildChallengeTx(serverKeypair, client, WALLET_LINK.homeDomain, WALLET_LINK.timeoutSeconds,
      STELLAR_TESTNET.networkPassphrase, WALLET_LINK.webAuthDomain),
    serverAccountId: serverKeypair.publicKey(),
    networkPassphrase: STELLAR_TESTNET.networkPassphrase,
  };
}

/**
 * Server: accepts only a challenge this server issued for `address`, still in time and signed
 * by that address. Returns the address. Throws a ChainError otherwise.
 */
export function verifyWalletChallenge(signedTransaction: string, serverAccountId: string, address: string): string {
  const client = validatePublicAddress(address);
  try {
    const { clientAccountID } = WebAuth.readChallengeTx(signedTransaction, serverAccountId,
      STELLAR_TESTNET.networkPassphrase, WALLET_LINK.homeDomain, WALLET_LINK.webAuthDomain);
    if (clientAccountID !== client) throw new Error("challenge for another account");
    const signers = WebAuth.verifyChallengeTxSigners(signedTransaction, serverAccountId,
      STELLAR_TESTNET.networkPassphrase, [client], WALLET_LINK.homeDomain, WALLET_LINK.webAuthDomain);
    if (!signers.includes(client)) throw new Error("missing client signature");
  } catch {
    throw new ChainError("WALLET_REJECTED", "La firma de la wallet no es valida o el desafio vencio.");
  }
  return client;
}

/**
 * Client: checks that `challenge` really is a login challenge for `address` (never a payment)
 * and has the wallet sign it.
 */
export async function signWalletChallenge(challenge: WalletChallenge, address: string, signer?: TransactionSigner): Promise<string> {
  const client = validatePublicAddress(address);
  if (challenge.networkPassphrase !== STELLAR_TESTNET.networkPassphrase) {
    throw new ChainError("NETWORK_MISMATCH", "El desafio no es de la red de pruebas.");
  }
  try {
    const { clientAccountID } = WebAuth.readChallengeTx(challenge.transaction, challenge.serverAccountId,
      STELLAR_TESTNET.networkPassphrase, WALLET_LINK.homeDomain, WALLET_LINK.webAuthDomain);
    if (clientAccountID !== client) throw new Error("other account");
  } catch {
    throw new ChainError("INVALID_RESPONSE", "El servidor envio un desafio invalido. No se firmo nada.");
  }
  const wallet = signer ?? await import("@stellar/freighter-api");
  const signed = await wallet.signTransaction(challenge.transaction, {
    networkPassphrase: STELLAR_TESTNET.networkPassphrase, address: client,
  });
  if (signed.error || !signed.signedTxXdr) throw new ChainError("WALLET_REJECTED", "La vinculacion no fue firmada.");
  return signed.signedTxXdr;
}

/** Server: the reward id of a merit for an account. Fixed, so a retry can never pay twice. */
export function meritRewardId(accountId: string, meritKey: string, contractId: string = COSMETICS_TESTNET.contractId): Uint8Array {
  return new Uint8Array(hash(Buffer.from(`impulso:${contractId}:${accountId}:${meritKey}`, "utf8")));
}

/** Signs transactions with a secret key held by the server (the minter). */
export function keypairSigner(keypair: Keypair): TransactionSigner {
  return {
    async signTransaction(xdr, opts) {
      const tx = TransactionBuilder.fromXDR(xdr, opts.networkPassphrase) as Transaction;
      tx.sign(keypair);
      return { signedTxXdr: tx.toXDR() };
    },
  };
}

/** Server: mints a merit piece to `to`, signed by the minter. Returns the new token id. */
export async function grantReward(
  minter: Keypair, to: string, classId: number, rewardId: Uint8Array, options: CallOptions = {},
): Promise<{ tokenId: number; transactionHash: string }> {
  if (rewardId.length !== 32) throw new ChainError("INVALID_RESPONSE", "Identificador de premio invalido.");
  const result = await submitContractCall(minter.publicKey(), options.contractId ?? COSMETICS_TESTNET.contractId, "grant", [
    new Address(validatePublicAddress(to)).toScVal(),
    nativeToScVal(validU32(classId), { type: "u32" }),
    nativeToScVal(Buffer.from(rewardId), { type: "bytes" }),
  ], keypairSigner(minter), options, "No se pudo entregar el premio.");
  return { tokenId: validU32(result.value), transactionHash: result.transactionHash };
}
