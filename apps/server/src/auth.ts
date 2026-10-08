import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyProgress, profileFor, rewardForCampaign, rewardForMatch, type AccountProgress, type CampaignOutcome, type MatchReward, type PlayerId, type ProgressProfile, type RivalDifficulty, type World } from '@impulso/sim';

const SESSION_MS = 24 * 60 * 60_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface StoredUser {
  id: string;
  email: string;
  salt: string;
  passwordHash: string;
  progress?: AccountProgress;
}

export interface PublicUser {
  id: string;
  email: string;
}

export class AuthError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

export class AuthService {
  private readonly users = new Map<string, StoredUser>();
  private readonly sessions = new Map<string, { userId: string; expiresAt: number }>();

  constructor(private readonly filePath: string | null = null) {
    if (filePath && existsSync(filePath)) {
      const stored = JSON.parse(readFileSync(filePath, 'utf8')) as StoredUser[];
      if (!Array.isArray(stored)) throw new Error('Invalid auth data file');
      for (const user of stored) this.users.set(user.email, user);
    }
  }

  register(email: unknown, password: unknown) {
    const normalized = this.validate(email, password);
    if (this.users.has(normalized)) throw new AuthError(409, 'email_in_use');
    const salt = randomBytes(16).toString('hex');
    const user: StoredUser = {
      id: randomUUID(), email: normalized, salt,
      passwordHash: scryptSync(password as string, salt, 64).toString('hex'),
    };
    this.users.set(normalized, user);
    try { this.persist(); } catch (error) { this.users.delete(normalized); throw error; }
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
    const user = [...this.users.values()].find((candidate) => candidate.id === session.userId);
    return user ? { id: user.id, email: user.email } : null;
  }

  logout(token: unknown): boolean {
    return typeof token === 'string' && this.sessions.delete(token);
  }

  profile(userId:string):ProgressProfile {
    const user=[...this.users.values()].find(u=>u.id===userId);
    if(!user)throw new AuthError(401,'authentication_required');
    return profileFor(user.progress ?? emptyProgress());
  }
  awardMatch(userId:string,matchId:string,world:World,player:PlayerId,difficulty:RivalDifficulty|'pvp'):MatchReward {
    return this.award(userId,progress=>rewardForMatch(progress,matchId,world,player,difficulty));
  }
  awardCampaign(userId:string,campaignId:string,outcome:CampaignOutcome,completedSectors:number,player:PlayerId):MatchReward {
    return this.award(userId,progress=>rewardForCampaign(progress,campaignId,outcome,completedSectors,player));
  }
  /** Saves only when the reward changed the progress; a repeated or empty reward writes nothing. */
  private award(userId:string,compute:(progress:AccountProgress)=>{progress:AccountProgress;reward:MatchReward}):MatchReward {
    const user=[...this.users.values()].find(u=>u.id===userId);
    if(!user)throw new AuthError(401,'authentication_required');
    const previous=user.progress,base=previous ?? emptyProgress();
    const result=compute(base);
    if(result.progress===base)return result.reward;
    user.progress=result.progress;
    try {this.persist();}catch(error){user.progress=previous;throw error;}
    return result.reward;
  }
  private validate(email: unknown, password: unknown): string {
    if (typeof email !== 'string' || typeof password !== 'string') throw new AuthError(400, 'invalid_credentials');
    const normalized = email.trim().toLowerCase();
    if (normalized.length > 254 || !EMAIL.test(normalized) || password.length < 8 || password.length > 128) {
      throw new AuthError(400, 'invalid_credentials');
    }
    return normalized;
  }

  private issue(user: StoredUser) {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = Date.now() + SESSION_MS;
    this.sessions.set(token, { userId: user.id, expiresAt });
    return { token, expiresAt, user: { id: user.id, email: user.email } };
  }

  private persist(): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify([...this.users.values()]), { mode: 0o600 });
    renameSync(temporary, this.filePath);
  }
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(header ?? '');
  return match?.[1] ?? null;
}
