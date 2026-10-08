import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { parseDisplayName } from '@impulso/input';
import { emptyProgress, profileFor, rewardForCampaign, rewardForMatch, type AccountProgress, type CampaignOutcome, type ChallengeId, type MatchReward, type PlayerId, type ProgressProfile, type RivalDifficulty, type World } from '@impulso/sim';
import { FileAccountStore, type AccountStore, type StoredUser } from './account-store';

const SESSION_MS = 24 * 60 * 60_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface PublicUser {
  id: string;
  email: string;
  /** Commander alias kept in the account; null until the player picks one. */
  displayName: string | null;
}

const publicUser = (user: StoredUser): PublicUser => ({ id: user.id, email: user.email, displayName: user.displayName ?? null });

export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

/**
 * Accounts, sessions and progression. Reads come from an in-memory copy so rooms never wait;
 * every write waits for the store (file or Postgres) before it counts.
 */
export class AuthService {
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, { userId: string; expiresAt: number }>();
  /** Awards for one account run one after another, so two rooms ending together add up. */
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly store: AccountStore;

  /** A file path (or null for memory only) loads synchronously; use `open` for Postgres. */
  constructor(storage: string | null | AccountStore = null, preloaded: readonly StoredUser[] = []) {
    const file = typeof storage === 'string' || storage === null ? new FileAccountStore(storage) : null;
    this.store = file ?? storage as AccountStore;
    for (const user of file ? file.load() : preloaded) this.users.set(user.email, user);
  }

  /** Loads every account from an asynchronous store before the server accepts players. */
  static async open(store: AccountStore & { load(): Promise<StoredUser[]> }): Promise<AuthService> {
    return new AuthService(store, await store.load());
  }

  /** Accounts survive a restart with a file or a database; sessions never do. */
  get persistent(): boolean { return this.store.kind !== 'memory'; }

  get storage(): AccountStore['kind'] { return this.store.kind; }

  /** The alias is optional; when sent it must be a valid commander name. */
  async register(email: unknown, password: unknown, displayName?: unknown) {
    const normalized = this.validate(email, password);
    const alias = displayName === undefined ? undefined : this.validateDisplayName(displayName);
    if (this.users.has(normalized)) throw new AuthError(409, 'email_in_use');
    const salt = randomBytes(16).toString('hex');
    const user: StoredUser = {
      id: randomUUID(), email: normalized, salt,
      passwordHash: scryptSync(password as string, salt, 64).toString('hex'),
      ...(alias === undefined ? {} : { displayName: alias }),
    };
    this.users.set(normalized, user);
    try {
      await this.store.createAccount(user, [...this.users.values()]);
    } catch (error) {
      this.users.delete(normalized);
      throw error;
    }
    return this.issue(user);
  }

  login(email: unknown, password: unknown) {
    const normalized = this.validate(email, password);
    const user = this.users.get(normalized);
    const salt = user?.salt ?? '00000000000000000000000000000000';
    const actual = scryptSync(password as string, salt, 64);
    const expected = user ? Buffer.from(user.passwordHash, 'hex') : Buffer.alloc(64);
    if (!user || expected.length !== actual.length || !timingSafeEqual(actual, expected)) {
      throw new AuthError(401, 'invalid_credentials');
    }
    return this.issue(user);
  }

  getUser(token: unknown): PublicUser | null {
    if (typeof token !== 'string') return null;
    const session = this.sessions.get(token);
    if (!session) return null;
    if (session.expiresAt <= Date.now()) { this.sessions.delete(token); return null; }
    const user = this.byId(session.userId);
    return user ? publicUser(user) : null;
  }

  logout(token: unknown): boolean {
    return typeof token === 'string' && this.sessions.delete(token);
  }

  profile(userId: string): ProgressProfile {
    const user = this.byId(userId);
    if (!user) throw new AuthError(401, 'authentication_required');
    return profileFor(user.progress ?? emptyProgress());
  }

  /** Sets the commander alias, which then follows the account to any device. The same alias writes nothing. */
  async updateDisplayName(userId: string, displayName: unknown): Promise<PublicUser> {
    const alias = this.validateDisplayName(displayName);
    return this.inQueue(userId, async () => {
      const user = this.byId(userId);
      if (!user) throw new AuthError(401, 'authentication_required');
      const previous = user.displayName;
      if (previous === alias) return publicUser(user);
      user.displayName = alias;
      try {
        await this.store.saveProfile(user, [...this.users.values()]);
      } catch (error) {
        user.displayName = previous;
        throw error;
      }
      return publicUser(user);
    });
  }

  awardMatch(userId: string, matchId: string, world: World, player: PlayerId, difficulty: RivalDifficulty | 'pvp'): Promise<MatchReward> {
    return this.award(userId, matchId, (progress) => rewardForMatch(progress, matchId, world, player, difficulty));
  }

  /** `sectors`: this player's challenge progress in each finished sector. */
  awardCampaign(userId: string, campaignId: string, outcome: CampaignOutcome, completedSectors: number, player: PlayerId,
    sectors: readonly Partial<Record<ChallengeId, number>>[] = []): Promise<MatchReward> {
    return this.award(userId, campaignId, (progress) => rewardForCampaign(progress, campaignId, outcome, completedSectors, player, sectors));
  }

  /** Saves only when the reward changed the progress; a repeated or empty reward writes nothing. */
  private award(userId: string, matchId: string, compute: (progress: AccountProgress) => { progress: AccountProgress; reward: MatchReward }): Promise<MatchReward> {
    return this.inQueue(userId, async () => {
      const user = this.byId(userId);
      if (!user) throw new AuthError(401, 'authentication_required');
      const previous = user.progress;
      const base = previous ?? emptyProgress();
      const result = compute(base);
      if (result.progress === base) return result.reward;
      user.progress = result.progress;
      try {
        await this.store.saveAward(user, { matchId, reward: result.reward }, [...this.users.values()]);
      } catch (error) {
        user.progress = previous;
        throw error;
      }
      return result.reward;
    });
  }

  private inQueue<T>(userId: string, task: () => Promise<T>): Promise<T> {
    const run = (this.queues.get(userId) ?? Promise.resolve()).then(task, task);
    this.queues.set(userId, run.catch(() => {}));
    return run;
  }

  private byId(userId: string): StoredUser | undefined {
    return [...this.users.values()].find((user) => user.id === userId);
  }

  private validate(email: unknown, password: unknown): string {
    if (typeof email !== 'string' || typeof password !== 'string') throw new AuthError(400, 'invalid_credentials');
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 254 || !EMAIL.test(normalized) || password.length < 8 || password.length > 128) {
      throw new AuthError(400, 'invalid_credentials');
    }
    return normalized;
  }

  private validateDisplayName(value: unknown): string {
    const alias = parseDisplayName(value);
    if (alias === null) throw new AuthError(400, 'invalid_display_name');
    return alias;
  }

  private issue(user: StoredUser) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_MS;
    this.sessions.set(token, { userId: user.id, expiresAt });
    return { token, expiresAt, user: publicUser(user) };
  }
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
  return match?.[1] ?? null;
}
