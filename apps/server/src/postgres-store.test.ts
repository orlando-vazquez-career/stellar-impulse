import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createMatchWorld } from '@impulso/sim';
import { Keypair } from '@stellar/stellar-sdk';
import { keypairSigner, signWalletChallenge } from '@impulso/chain';
import { AuthService } from './auth.js';
import { openPostgresAuth, PostgresAccountStore } from './postgres-store.js';

// Runs against a real, disposable Postgres: `DATABASE_URL_TEST` (local Docker or the CI service).
const url = process.env.DATABASE_URL_TEST;
const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');

describe.skipIf(!url)('accounts in Postgres', () => {
  const sql = new pg.Pool({ connectionString: url });
  const stores: PostgresAccountStore[] = [];
  const open = async () => { const store = new PostgresAccountStore(url!); stores.push(store); return { store, auth: await AuthService.open(store) }; };
  const won = () => { const world = createMatchWorld('sector-01', 'complete'); world.winner = 'p1'; world.matchRecord!.players.p1.kills = 15; world.matchRecord!.players.p1.combatLosses = 1; return world; };

  beforeAll(() => {
    execSync('pnpm exec prisma migrate deploy', { cwd: serverDir, env: { ...process.env, DATABASE_URL: url }, stdio: 'pipe' });
  }, 120_000);
  beforeEach(async () => { await sql.query('TRUNCATE accounts CASCADE'); });
  afterAll(async () => { await Promise.all(stores.map((store) => store.close())); await sql.end(); });

  it('keeps accounts and logins across a restart', async () => {
    const first = await open();
    const { user } = await first.auth.register('ana@example.com', 'Secret-1234');
    const second = await open();
    expect(second.auth.login('ana@example.com', 'Secret-1234').user).toEqual(user);
    const { rows } = await sql.query('SELECT email, password_hash FROM accounts');
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('ana@example.com');
    expect(rows[0].password_hash).not.toContain('Secret-1234');
  });

  it('saves XP, the challenge, its best mark and the match row from one result', async () => {
    const { auth } = await open();
    const { user } = await auth.register('beto@example.com', 'Secret-1234');
    // Win 100 + core 25 at medium on a complete match, plus 50 for "scrapper" (15 kills).
    const reward = await auth.awardMatch(user.id, 'room-1', won(), 'p1', 'medium');
    expect(reward.xpGained).toBe(175);
    expect((await sql.query('SELECT xp FROM accounts')).rows[0].xp).toBe(175);
    expect((await sql.query("SELECT key, kind, match_id FROM achievements")).rows).toEqual([{ key: 'scrapper', kind: 'challenge', match_id: 'room-1' }]);
    expect((await sql.query("SELECT best FROM challenge_bests WHERE challenge_id = 'scrapper'")).rows[0].best).toBe(15);
    expect((await sql.query('SELECT match_id, xp_gained, challenges FROM match_awards')).rows).toEqual([{ match_id: 'room-1', xp_gained: 175, challenges: ['scrapper'] }]);
    const restarted = await open();
    expect(restarted.auth.profile(user.id)).toEqual(auth.profile(user.id));
  });

  it('stores campaign emblems as merit achievements', async () => {
    const { auth } = await open();
    const { user } = await auth.register('caro@example.com', 'Secret-1234');
    await auth.awardCampaign(user.id, 'campaign:ROOM', { winner: 'p1', reason: 'core' }, 3, 'p1');
    const { rows } = await sql.query("SELECT key FROM achievements WHERE kind = 'merit' ORDER BY key");
    expect(rows.map((row) => row.key)).toEqual(['exploracion', 'primera-victoria']);
    expect((await open()).auth.profile(user.id).merits).toEqual(['primera-victoria', 'exploracion']);
  });

  it('never counts a repeated result twice, even from a server with stale memory', async () => {
    const a = await open();
    const { user } = await a.auth.register('dani@example.com', 'Secret-1234');
    const stale = await open();
    await a.auth.awardCampaign(user.id, 'campaign:SAME', { winner: 'p1', reason: 'core' }, 3, 'p1');
    await stale.auth.awardCampaign(user.id, 'campaign:SAME', { winner: 'p1', reason: 'core' }, 3, 'p1');
    expect((await sql.query('SELECT xp FROM accounts')).rows[0].xp).toBe(125);
    expect((await sql.query('SELECT count(*)::int AS n FROM match_awards')).rows[0].n).toBe(1);
  });

  it('keeps the commander alias across a restart and saves a change without touching progress', async () => {
    const first = await open();
    const { user } = await first.auth.register('hugo@example.com', 'Secret-1234', 'Hugo');
    expect((await sql.query('SELECT display_name FROM accounts')).rows).toEqual([{ display_name: 'Hugo' }]);
    expect((await open()).auth.login('hugo@example.com', 'Secret-1234').user).toEqual(user);
    await first.auth.awardMatch(user.id, 'room-1', won(), 'p1', 'medium');
    await first.auth.updateDisplayName(user.id, 'Nova');
    expect((await sql.query('SELECT display_name, xp FROM accounts')).rows).toEqual([{ display_name: 'Nova', xp: 175 }]);
    const restarted = await open();
    expect(restarted.auth.login('hugo@example.com', 'Secret-1234').user).toEqual({ ...user, displayName: 'Nova' });
    expect(restarted.auth.profile(user.id).xp).toBe(175);
  });

  it('keeps the linked wallet and refuses one already linked by another server', async () => {
    const first = await open();
    const ana = (await first.auth.register('ana-wallet@example.com', 'Secret-1234')).user;
    const wallet = Keypair.random();
    const link = async (auth: AuthService, userId: string) => auth.linkWallet(userId,
      await signWalletChallenge(auth.walletChallenge(userId, wallet.publicKey()), wallet.publicKey(), keypairSigner(wallet)));
    await link(first.auth, ana.id);
    const second = await open();
    expect(second.auth.login('ana-wallet@example.com', 'Secret-1234').user.walletAddress).toBe(wallet.publicKey());
    // A server that has not seen the link yet still cannot give the wallet to another account.
    const third = await open();
    await first.auth.unlinkWallet(ana.id);
    await link(first.auth, ana.id);
    const beto = (await third.auth.register('beto-wallet@example.com', 'Secret-1234')).user;
    await expect(link(third.auth, beto.id)).rejects.toMatchObject({ code: 'wallet_in_use' });
  });

  it('refuses an email another server registered first', async () => {
    const a = await open();
    const b = await open();
    await a.auth.register('eva@example.com', 'Secret-1234');
    await expect(b.auth.register('eva@example.com', 'Secret-1234')).rejects.toMatchObject({ status: 409, code: 'email_in_use' });
    expect(() => b.auth.login('eva@example.com', 'Secret-1234')).toThrow();
  });

  it('adds up two results that finish at the same time', async () => {
    const { auth } = await open();
    const { user } = await auth.register('fede@example.com', 'Secret-1234');
    await Promise.all([
      auth.awardCampaign(user.id, 'campaign:A', { winner: 'p1', reason: 'core' }, 3, 'p1'),
      auth.awardCampaign(user.id, 'campaign:B', { winner: 'p2', reason: 'core' }, 3, 'p1'),
    ]);
    expect(auth.profile(user.id).xp).toBe(165);
    expect((await sql.query('SELECT xp FROM accounts')).rows[0].xp).toBe(165);
  });

  it('imports the accounts of the old file once, with their progress', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'impulso-import-'));
    try {
      const file = join(dir, 'users.json');
      const legacy = new AuthService(file);
      const { user } = await legacy.register('gabi@example.com', 'Secret-1234', 'Gabi');
      await legacy.awardMatch(user.id, 'old-room', won(), 'p1', 'medium');
      const store = new PostgresAccountStore(url!); stores.push(store);
      const imported = await openPostgresAuth(store, file);
      expect(imported.login('gabi@example.com', 'Secret-1234').user).toEqual(user);
      expect(imported.profile(user.id)).toEqual(legacy.profile(user.id));
      expect((await sql.query('SELECT display_name FROM accounts')).rows).toEqual([{ display_name: 'Gabi' }]);
      const again = new PostgresAccountStore(url!); stores.push(again);
      await openPostgresAuth(again, file);
      expect((await sql.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n).toBe(1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
