import { afterEach, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createMatchWorld } from '@impulso/sim';
import { createGameServer } from './app.js';
import { AuthService } from './auth.js';
import { trainingReward } from './training-room.js';

const dirs: string[] = [];
function tempDir() { const dir = mkdtempSync(join(tmpdir(), 'impulso-auth-')); dirs.push(dir); return dir; }
afterEach(() => { for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true }); });

it('recovers the accounts from the backup when the main file is unreadable', async () => {
  const file = join(tempDir(), 'users.json');
  const auth = new AuthService(file);
  await auth.register('ana@example.com', 'secret-1234');
  await auth.register('beto@example.com', 'secret-1234');
  writeFileSync(file, '[{"id":"tru'); // what a lost write leaves behind
  const restarted = new AuthService(file);
  expect(restarted.login('ana@example.com', 'secret-1234').user.email).toBe('ana@example.com');
});

it('refuses to start with no accounts when neither file can be read', async () => {
  const file = join(tempDir(), 'users.json');
  writeFileSync(file, 'garbage');
  writeFileSync(`${file}.bak`, 'garbage');
  expect(() => new AuthService(file)).toThrow(/users\.json/);
});

it('reports in /health that accounts are kept on disk', async () => {
  const port = 35_000 + Math.floor(Math.random() * 900);
  const server = createGameServer({ authDataFile: join(tempDir(), 'users.json') });
  await server.listen(port, '127.0.0.1');
  try {
    expect(await (await fetch(`http://127.0.0.1:${port}/health`)).json()).toMatchObject({ status: 'ok', persistent: true });
  } finally {
    await server.gracefullyShutdown(false);
  }
});

it('keeps the room alive and the profile unchanged when the account file cannot be written', async () => {
  const dir = tempDir();
  const file = join(dir, 'data', 'users.json');
  const auth = new AuthService(file);
  const user = (await auth.register('rated@example.com', 'secret-1234')).user;
  rmSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'data'), 'a file where the data folder should be');
  const world = createMatchWorld('sector-01', 'complete'); world.winner = 'p1';
  const reward = await trainingReward(auth, user.id, 'room', world, 'p1', 'hard');
  expect(reward).toMatchObject({ xpGained: 0, challenges: [], unlocked: [], saveFailed: true });
  expect(auth.profile(user.id).xp).toBe(0);
});
