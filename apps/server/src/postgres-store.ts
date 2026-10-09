import { existsSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { CHALLENGES, MERITS, type AccountProgress, type AwardRecord, type ChallengeId, type MeritId } from '@impulso/sim';
import { FileAccountStore, type AccountStore, type SavedAward, type StoredUser } from './account-store';
import { AuthError, AuthService } from './auth';
import { Prisma, PrismaClient } from './generated/prisma/client';

/** The in-memory copy keeps this many recent results per account; the table keeps all of them. */
const RECENT_AWARDS = 100;
const order = (ids: readonly string[]) => (key: string) => ids.indexOf(key);
const challengeOrder = order(CHALLENGES.map((challenge) => challenge.id));
const meritOrder = order(MERITS.map((merit) => merit.id));

const duplicate = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';

/** Accounts, achievements, best marks and match results in Postgres. */
export class PostgresAccountStore implements AccountStore {
  readonly kind = 'postgres' as const;
  private readonly db: PrismaClient;

  constructor(connectionString: string) {
    this.db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }

  async load(): Promise<StoredUser[]> {
    const accounts = await this.db.account.findMany({
      include: {
        achievements: { orderBy: { achievedAt: 'asc' } },
        challengeBests: true,
        matchAwards: { orderBy: { createdAt: 'desc' }, take: RECENT_AWARDS },
      },
    });
    return accounts.map((account) => {
      const earned = (kind: 'challenge' | 'merit', rank: (key: string) => number) => account.achievements
        .filter((achievement) => achievement.kind === kind)
        .sort((a, b) => a.achievedAt.getTime() - b.achievedAt.getTime() || rank(a.key) - rank(b.key))
        .map((achievement) => achievement.key);
      const awards: Record<string, AwardRecord> = {};
      for (const award of [...account.matchAwards].reverse()) {
        awards[award.matchId] = {
          xpGained: award.xpGained, beforeXp: award.beforeXp, challenges: award.challenges as ChallengeId[], unlocked: award.unlocked,
          ...(award.merits.length ? { merits: award.merits as MeritId[] } : {}),
        };
      }
      const merits = earned('merit', meritOrder) as MeritId[];
      const progress: AccountProgress = {
        xp: account.xp,
        completed: earned('challenge', challengeOrder) as ChallengeId[],
        best: Object.fromEntries(account.challengeBests.map((best) => [best.challengeId, best.best])),
        awards,
        ...(merits.length ? { merits } : {}),
      };
      return {
        id: account.id, email: account.email, salt: account.salt, passwordHash: account.passwordHash,
        ...(account.displayName === null ? {} : { displayName: account.displayName }), progress,
      };
    });
  }

  async createAccount(user: StoredUser): Promise<void> {
    try {
      await this.db.account.create({ data: { id: user.id, email: user.email, salt: user.salt, passwordHash: user.passwordHash, displayName: user.displayName ?? null } });
    } catch (error) {
      if (duplicate(error)) throw new AuthError(409, 'email_in_use');
      throw error;
    }
  }

  /** Writes only the profile columns, so it never races the XP another process adds. */
  async saveProfile(user: StoredUser): Promise<void> {
    await this.db.account.update({ where: { id: user.id }, data: { displayName: user.displayName ?? null } });
  }

  /** XP is added in the database, so results saved by different processes still sum up. */
  async saveAward(user: StoredUser, { matchId, reward }: SavedAward): Promise<void> {
    const best = user.progress?.best ?? {};
    try {
      await this.db.$transaction(async (tx) => {
        await tx.matchAward.create({ data: {
          accountId: user.id, matchId, xpGained: reward.xpGained, beforeXp: reward.beforeXp,
          challenges: reward.challenges, merits: reward.merits ?? [], unlocked: reward.unlocked,
        } });
        await tx.account.update({ where: { id: user.id }, data: { xp: { increment: reward.xpGained } } });
        for (const [challengeId, value] of Object.entries(best)) {
          await tx.$executeRaw`INSERT INTO challenge_bests (account_id, challenge_id, best)
            VALUES (${user.id}::uuid, ${challengeId}, ${value})
            ON CONFLICT (account_id, challenge_id) DO UPDATE SET best = GREATEST(challenge_bests.best, EXCLUDED.best)`;
        }
        const achievements = [
          ...reward.challenges.map((key) => ({ key, kind: 'challenge' as const })),
          ...(reward.merits ?? []).map((key) => ({ key, kind: 'merit' as const })),
        ];
        if (achievements.length) {
          await tx.achievement.createMany({ data: achievements.map((row) => ({ ...row, accountId: user.id, matchId })), skipDuplicates: true });
        }
      });
    } catch (error) {
      // The match row already exists: another save (or another process) recorded this result.
      if (duplicate(error)) return;
      throw error;
    }
  }

  async isEmpty(): Promise<boolean> {
    return (await this.db.account.count()) === 0;
  }

  /** One-time move from the JSON file; achievements keep no match because the file never had one. */
  async importAccounts(users: readonly StoredUser[]): Promise<void> {
    await this.db.$transaction(async (tx) => {
      for (const user of users) {
        const progress = user.progress;
        await tx.account.create({ data: {
          id: user.id, email: user.email, salt: user.salt, passwordHash: user.passwordHash,
          displayName: user.displayName ?? null, xp: progress?.xp ?? 0,
        } });
        if (!progress) continue;
        const achievements = [
          ...progress.completed.map((key) => ({ key, kind: 'challenge' as const })),
          ...(progress.merits ?? []).map((key) => ({ key, kind: 'merit' as const })),
        ];
        if (achievements.length) await tx.achievement.createMany({ data: achievements.map((row) => ({ ...row, accountId: user.id })) });
        const bests = Object.entries(progress.best).map(([challengeId, best]) => ({ accountId: user.id, challengeId, best: best! }));
        if (bests.length) await tx.challengeBest.createMany({ data: bests });
        const awards = Object.entries(progress.awards).map(([matchId, award]) => ({
          accountId: user.id, matchId, xpGained: award.xpGained, beforeXp: award.beforeXp,
          challenges: award.challenges, merits: award.merits ?? [], unlocked: award.unlocked,
        }));
        if (awards.length) await tx.matchAward.createMany({ data: awards });
      }
    });
  }

  close(): Promise<void> {
    return this.db.$disconnect();
  }
}

/**
 * Opens the accounts in Postgres. The first time the database is empty, it brings over the
 * accounts of the JSON file the server used before (`AUTH_DATA_FILE`), progress included.
 */
export async function openPostgresAuth(store: PostgresAccountStore, legacyFile?: string): Promise<AuthService> {
  if (legacyFile && existsSync(legacyFile) && await store.isEmpty()) {
    const users = new FileAccountStore(legacyFile).load();
    if (users.length) {
      await store.importAccounts(users);
      console.log(`[accounts] imported ${users.length} accounts from ${legacyFile}`);
    }
  }
  return AuthService.open(store);
}
