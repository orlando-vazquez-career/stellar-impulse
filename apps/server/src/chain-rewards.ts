import { Keypair } from '@stellar/stellar-sdk';
import { COSMETICS_TESTNET, grantReward, isRewardClaimed, MERIT_CLASSES, meritRewardId } from '@impulso/chain';

/** What the rewards service needs from the network; tests pass a double. */
export interface RewardChain {
  readonly contractId: string;
  isClaimed(rewardId: Uint8Array): Promise<boolean>;
  grant(to: string, classId: number, rewardId: Uint8Array): Promise<{ tokenId: number; transactionHash: string }>;
}

export interface MeritHolder {
  id: string;
  walletAddress?: string;
  merits: readonly string[];
}

export type GrantOutcome =
  | { merit: string; status: 'granted'; tokenId: number; transactionHash: string }
  | { merit: string; status: 'already_on_chain' }
  | { merit: string; status: 'failed'; reason: string };

/**
 * Mints the merit emblems an account earned to its linked wallet, signed by the minter.
 * Each reward id is fixed per account and merit, so retries and restarts never pay twice:
 * the contract refuses a second grant and the service checks before trying.
 */
export class ChainRewards {
  /** One minter account signs everything, so grants run one after another (sequence numbers). */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly chain: RewardChain | null) {}

  /** Uses `STELLAR_MINTER_SECRET`; without it on-chain rewards are off and the game is unaffected. */
  static fromEnv(env: NodeJS.ProcessEnv = process.env): ChainRewards {
    const secret = env.STELLAR_MINTER_SECRET;
    if (!secret) {
      console.warn('[rewards] STELLAR_MINTER_SECRET is not set: merit emblems will not be minted on testnet');
      return new ChainRewards(null);
    }
    const minter = Keypair.fromSecret(secret);
    const contractId = env.COSMETICS_CONTRACT_ID ?? COSMETICS_TESTNET.contractId;
    return new ChainRewards({
      contractId,
      isClaimed: (rewardId) => isRewardClaimed(rewardId, { contractId }),
      grant: (to, classId, rewardId) => grantReward(minter, to, classId, rewardId, { contractId }),
    });
  }

  get enabled(): boolean { return this.chain !== null; }

  /** Grants every earned merit that is not on chain yet. Never throws; failures are reported. */
  sync(holder: MeritHolder): Promise<GrantOutcome[]> {
    const chain = this.chain;
    const wallet = holder.walletAddress;
    if (!chain || !wallet) return Promise.resolve([]);
    const run = this.queue.then(async () => {
      const outcomes: GrantOutcome[] = [];
      for (const merit of holder.merits) {
        const classId = MERIT_CLASSES[merit];
        if (classId === undefined) continue;
        const rewardId = meritRewardId(holder.id, merit, chain.contractId);
        try {
          if (await chain.isClaimed(rewardId)) {
            outcomes.push({ merit, status: 'already_on_chain' });
            continue;
          }
          const granted = await chain.grant(wallet, classId, rewardId);
          console.log(`[rewards] ${merit} minted to ${wallet} (token ${granted.tokenId}, tx ${granted.transactionHash})`);
          outcomes.push({ merit, status: 'granted', ...granted });
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          console.error(`[rewards] could not mint ${merit} to ${wallet}: ${reason}`);
          outcomes.push({ merit, status: 'failed', reason });
        }
      }
      return outcomes;
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
