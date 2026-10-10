import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Keypair } from '@stellar/stellar-sdk';
import { keypairSigner, signWalletChallenge, type WalletChallenge } from '@impulso/chain';
import { createGameServer } from './app.js';
import { AuthService } from './auth.js';
import { ChainRewards, type RewardChain } from './chain-rewards.js';

/** Records grants instead of reaching testnet; a reward id is claimed once, like the contract. */
function fakeChain() {
  const claimed = new Set<string>();
  const grants: { to: string; classId: number }[] = [];
  const chain: RewardChain = {
    contractId: 'CTEST',
    isClaimed: async (rewardId) => claimed.has(Buffer.from(rewardId).toString('hex')),
    grant: async (to, classId, rewardId) => {
      claimed.add(Buffer.from(rewardId).toString('hex'));
      grants.push({ to, classId });
      return { tokenId: grants.length, transactionHash: 'ab'.repeat(32) };
    },
  };
  return { chain, grants };
}

const sign = (challenge: WalletChallenge, key: Keypair) => signWalletChallenge(challenge, key.publicKey(), keypairSigner(key));
const wonCampaign = { winner: 'p1' as const, reason: 'core' as const };

describe('wallet link', () => {
  it('links the address that signed the challenge, once', async () => {
    const auth = new AuthService();
    const { user } = await auth.register('ana-wallet@example.com', 'Secret-1234');
    const wallet = Keypair.random();
    const challenge = auth.walletChallenge(user.id, wallet.publicKey());
    const signed = await sign(challenge, wallet);

    expect((await auth.linkWallet(user.id, signed)).walletAddress).toBe(wallet.publicKey());
    // The challenge is single use.
    await expect(auth.linkWallet(user.id, signed)).rejects.toMatchObject({ code: 'wallet_challenge_expired' });
  });

  it('refuses a signature from another key or a challenge another account asked for', async () => {
    const auth = new AuthService();
    const ana = (await auth.register('ana-sig@example.com', 'Secret-1234')).user;
    const beto = (await auth.register('beto-sig@example.com', 'Secret-1234')).user;
    const wallet = Keypair.random();
    const challenge = auth.walletChallenge(ana.id, wallet.publicKey());
    const forged = await keypairSigner(Keypair.random()).signTransaction(challenge.transaction, {
      networkPassphrase: challenge.networkPassphrase, address: wallet.publicKey(),
    });
    await expect(auth.linkWallet(ana.id, forged.signedTxXdr)).rejects.toMatchObject({ code: 'invalid_wallet_signature' });

    const signed = await sign(auth.walletChallenge(ana.id, wallet.publicKey()), wallet);
    auth.walletChallenge(beto.id, Keypair.random().publicKey());
    await expect(auth.linkWallet(beto.id, signed)).rejects.toMatchObject({ code: 'invalid_wallet_signature' });
    await expect(auth.linkWallet(ana.id, 'not a transaction')).rejects.toMatchObject({ code: 'invalid_wallet_signature' });
  });

  it('keeps one wallet per account and lets the player unlink it', async () => {
    const auth = new AuthService();
    const ana = (await auth.register('ana-one@example.com', 'Secret-1234')).user;
    const beto = (await auth.register('beto-one@example.com', 'Secret-1234')).user;
    const wallet = Keypair.random();
    await auth.linkWallet(ana.id, await sign(auth.walletChallenge(ana.id, wallet.publicKey()), wallet));
    const again = await sign(auth.walletChallenge(beto.id, wallet.publicKey()), wallet);
    await expect(auth.linkWallet(beto.id, again)).rejects.toMatchObject({ status: 409, code: 'wallet_in_use' });

    expect((await auth.unlinkWallet(ana.id)).walletAddress).toBeNull();
    const retry = await sign(auth.walletChallenge(beto.id, wallet.publicKey()), wallet);
    expect((await auth.linkWallet(beto.id, retry)).walletAddress).toBe(wallet.publicKey());
  });

  it('rejects an address that is not a Stellar account', async () => {
    const auth = new AuthService();
    const { user } = await auth.register('ana-bad@example.com', 'Secret-1234');
    expect(() => auth.walletChallenge(user.id, 'G123')).toThrow(expect.objectContaining({ code: 'invalid_wallet' }));
  });
});

describe('wallet in the account file', () => {
  const dirs: string[] = [];
  afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

  it('survives a restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'impulso-wallet-'));
    dirs.push(dir);
    const file = join(dir, 'users.json');
    const auth = new AuthService(file);
    const { user } = await auth.register('ana-file@example.com', 'Secret-1234');
    const wallet = Keypair.random();
    await auth.linkWallet(user.id, await sign(auth.walletChallenge(user.id, wallet.publicKey()), wallet));
    expect(new AuthService(file).login('ana-file@example.com', 'Secret-1234').user.walletAddress).toBe(wallet.publicKey());
  });
});

describe('merit emblems on chain', () => {
  it('mints new emblems to the linked wallet once, and earlier ones when a wallet is linked', async () => {
    const { chain, grants } = fakeChain();
    const auth = new AuthService();
    auth.useChainRewards(new ChainRewards(chain));
    const { user } = await auth.register('ana-merit@example.com', 'Secret-1234');

    // Won before linking: nothing can be minted yet.
    await auth.awardCampaign(user.id, 'campaign:one', wonCampaign, 1, 'p1');
    expect(grants).toEqual([]);

    const wallet = Keypair.random();
    await auth.linkWallet(user.id, await sign(auth.walletChallenge(user.id, wallet.publicKey()), wallet));
    await auth.syncMerits(user.id);
    expect(grants).toEqual([{ to: wallet.publicKey(), classId: 3 }, { to: wallet.publicKey(), classId: 4 }]);

    // Syncing again (or another win) never mints the same emblem twice.
    const again = await auth.syncMerits(user.id);
    expect(again.map((outcome) => outcome.status)).toEqual(['already_on_chain', 'already_on_chain']);
    await auth.awardCampaign(user.id, 'campaign:two', wonCampaign, 1, 'p1');
    await auth.syncMerits(user.id);
    expect(grants).toHaveLength(2);
  });

  it('reports a failed grant without breaking the match result', async () => {
    const chain: RewardChain = {
      contractId: 'CTEST', isClaimed: async () => false,
      grant: async () => { throw new Error('testnet is down'); },
    };
    const auth = new AuthService();
    auth.useChainRewards(new ChainRewards(chain));
    const { user } = await auth.register('ana-down@example.com', 'Secret-1234');
    const wallet = Keypair.random();
    await auth.linkWallet(user.id, await sign(auth.walletChallenge(user.id, wallet.publicKey()), wallet));
    const reward = await auth.awardCampaign(user.id, 'campaign:down', wonCampaign, 1, 'p1');
    expect(reward.merits).toEqual(['primera-victoria', 'exploracion']);
    const outcomes = await auth.syncMerits(user.id);
    expect(outcomes.every((outcome) => outcome.status === 'failed')).toBe(true);
  });

  it('does nothing without a minter key', async () => {
    expect(ChainRewards.fromEnv({}).enabled).toBe(false);
  });
});

describe('merit backfill', () => {
  /** Accounts that earned emblems while the server had no minter key. */
  async function earnedWhileOff() {
    const auth = new AuthService();
    const linked = (await auth.register('ana-backfill@example.com', 'Secret-1234')).user;
    const unlinked = (await auth.register('beto-backfill@example.com', 'Secret-1234')).user;
    const idle = (await auth.register('caro-backfill@example.com', 'Secret-1234')).user;
    const wallet = Keypair.random();
    const idleWallet = Keypair.random();
    await auth.linkWallet(linked.id, await sign(auth.walletChallenge(linked.id, wallet.publicKey()), wallet));
    await auth.linkWallet(idle.id, await sign(auth.walletChallenge(idle.id, idleWallet.publicKey()), idleWallet));
    await auth.awardCampaign(linked.id, 'campaign:off', wonCampaign, 1, 'p1');
    await auth.awardCampaign(unlinked.id, 'campaign:off', wonCampaign, 1, 'p1');
    return { auth, wallet };
  }

  it('mints the merits of every linked account once, and only those', async () => {
    const { auth, wallet } = await earnedWhileOff();
    const { chain, grants } = fakeChain();
    auth.useChainRewards(new ChainRewards(chain));

    const first = await auth.backfillMerits();
    expect(first.map((outcome) => outcome.status)).toEqual(['granted', 'granted']);
    expect(grants).toEqual([{ to: wallet.publicKey(), classId: 3 }, { to: wallet.publicKey(), classId: 4 }]);

    const again = await auth.backfillMerits();
    expect(again.map((outcome) => outcome.status)).toEqual(['already_on_chain', 'already_on_chain']);
    expect(grants).toHaveLength(2);
  });

  it('does nothing without a minter key', async () => {
    const { auth } = await earnedWhileOff();
    expect(await auth.backfillMerits()).toEqual([]);
  });

  it('runs when the server starts with a minter key, and not without one', async () => {
    const off = await earnedWhileOff();
    const skipped = vi.spyOn(off.auth, 'backfillMerits');
    createGameServer({ auth: off.auth, chainRewards: new ChainRewards(null) });
    expect(skipped).not.toHaveBeenCalled();

    // Built, never listening: the backfill starts with the server, not with its first request.
    const on = await earnedWhileOff();
    const { chain, grants } = fakeChain();
    const started = vi.spyOn(on.auth, 'backfillMerits');
    createGameServer({ auth: on.auth, chainRewards: new ChainRewards(chain) });
    expect(started).toHaveBeenCalledTimes(1);
    await started.mock.results[0]!.value;
    expect(grants).toEqual([{ to: on.wallet.publicKey(), classId: 3 }, { to: on.wallet.publicKey(), classId: 4 }]);
  });

  it('hands the minter to the accounts when the server starts, even without a key', async () => {
    const { auth } = await earnedWhileOff();
    const handed = vi.spyOn(auth, 'useChainRewards');
    const rewards = new ChainRewards(null);
    createGameServer({ auth, chainRewards: rewards });
    expect(handed).toHaveBeenCalledWith(rewards);
  });
});

describe('wallet routes', () => {
  const PORT = 32_000 + Math.floor(Math.random() * 900);
  const URL = `http://127.0.0.1:${PORT}`;
  const { chain } = fakeChain();
  const auth = new AuthService();
  const server = createGameServer({ auth, chainRewards: new ChainRewards(chain) });
  beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
  afterAll(async () => { await server.gracefullyShutdown(false); });

  it('runs the link from challenge to account over HTTP', async () => {
    const { token } = await auth.register('ana-http@example.com', 'Secret-1234');
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const wallet = Keypair.random();
    const challengeResponse = await fetch(`${URL}/wallet/challenge`, { method: 'POST', headers, body: JSON.stringify({ address: wallet.publicKey() }) });
    expect(challengeResponse.status).toBe(200);
    const signed = await sign(await challengeResponse.json() as WalletChallenge, wallet);
    const link = await fetch(`${URL}/wallet/link`, { method: 'POST', headers, body: JSON.stringify({ transaction: signed }) });
    expect(link.status).toBe(200);
    expect((await link.json() as { user: { walletAddress: string } }).user.walletAddress).toBe(wallet.publicKey());
    const me = await fetch(`${URL}/auth/me`, { headers });
    expect((await me.json() as { user: { walletAddress: string } }).user.walletAddress).toBe(wallet.publicKey());
    const unlink = await fetch(`${URL}/wallet`, { method: 'DELETE', headers });
    expect((await unlink.json() as { user: { walletAddress: string | null } }).user.walletAddress).toBeNull();
    const anonymous = await fetch(`${URL}/wallet/challenge`, { method: 'POST', body: JSON.stringify({ address: wallet.publicKey() }) });
    expect(anonymous.status).toBe(401);
  });
});
