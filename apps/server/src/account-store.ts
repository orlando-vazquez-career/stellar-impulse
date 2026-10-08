import { randomUUID } from 'node:crypto';
import { closeSync, copyFileSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AccountProgress, MatchReward } from '@impulso/sim';

export interface StoredUser {
  id: string;
  email: string;
  salt: string;
  passwordHash: string;
  /** Commander alias shown in menus and rooms; absent until the player picks one. */
  displayName?: string;
  progress?: AccountProgress;
}

/** One official result, already applied to `user.progress`. */
export interface SavedAward {
  matchId: string;
  reward: MatchReward;
}

/**
 * Where accounts live between restarts. The auth service keeps a working copy in memory;
 * a store only has to make each change durable, all or nothing.
 */
export interface AccountStore {
  readonly kind: 'memory' | 'file' | 'postgres';
  /** Rejects with `AuthError(409, 'email_in_use')` when the email is taken. */
  createAccount(user: StoredUser, all: readonly StoredUser[]): Promise<void>;
  /** A repeated `matchId` for the same account must change nothing. */
  saveAward(user: StoredUser, award: SavedAward, all: readonly StoredUser[]): Promise<void>;
  /** Stores the profile fields of `user` (the commander alias). */
  saveProfile(user: StoredUser, all: readonly StoredUser[]): Promise<void>;
}

/** The JSON file used by development and E2E runs; no path keeps accounts in memory only. */
export class FileAccountStore implements AccountStore {
  readonly kind: 'memory' | 'file';
  /** False after loading from the backup: the next write must not copy the broken file over it. */
  private mainReadable = true;

  constructor(private readonly filePath: string | null) {
    this.kind = filePath ? 'file' : 'memory';
  }

  load(): StoredUser[] {
    if (!this.filePath) return [];
    const loaded = loadUsers(this.filePath);
    this.mainReadable = loaded.fromMain;
    return loaded.users;
  }

  async createAccount(_user: StoredUser, all: readonly StoredUser[]): Promise<void> { this.persist(all); }

  async saveAward(_user: StoredUser, _award: SavedAward, all: readonly StoredUser[]): Promise<void> { this.persist(all); }

  async saveProfile(_user: StoredUser, all: readonly StoredUser[]): Promise<void> { this.persist(all); }

  /** Flushes a temporary file to disk, keeps the previous version as `.bak` and swaps it in atomically. */
  private persist(all: readonly StoredUser[]): void {
    if (!this.filePath) return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const fd = openSync(temporary, 'w', 0o600);
      try { writeFileSync(fd, JSON.stringify(all)); fsyncSync(fd); } finally { closeSync(fd); }
      if (this.mainReadable && existsSync(this.filePath)) copyFileSync(this.filePath, `${this.filePath}.bak`);
      renameSync(temporary, this.filePath);
      this.mainReadable = true;
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }
}

function readUsers(path: string): StoredUser[] {
  const stored = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  if (!Array.isArray(stored)) throw new Error(`${path} is not an account list`);
  return stored as StoredUser[];
}

/** The main file, or the copy kept before the last write. Never starts empty over unreadable data. */
function loadUsers(file: string): { users: StoredUser[]; fromMain: boolean } {
  const backup = `${file}.bak`;
  if (!existsSync(file) && !existsSync(backup)) return { users: [], fromMain: true };
  try {
    return { users: readUsers(file), fromMain: true };
  } catch (error) {
    try {
      const users = readUsers(backup);
      console.warn(`[auth] ${file} is unreadable; loaded ${backup}`);
      return { users, fromMain: false };
    } catch {
      throw new Error(`Cannot read account data from ${file} or its backup`, { cause: error });
    }
  }
}
