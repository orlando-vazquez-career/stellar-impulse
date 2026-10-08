import { expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createGameServer } from './app.js';
import * as campaigns from './campaign/machine.js';
import { AuthService } from './auth.js';

// Own file: Colyseus keeps one matchmaker per process, so a second server cannot share a test file.
const PORT = 32_000 + Math.floor(Math.random() * 900);
const envelope = (body: unknown) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body });
const oneSectorWonByP1: Partial<campaigns.CampaignConfig> = {
  sectors: 1, countdownMs: 100, resultsMs: 2_000,
  createSector: (sector) => ({ ...campaigns.DEFAULT_CONFIG.createSector(sector), winner: 'p1' }),
};

function next<T = any>(room: Room, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = room.onMessage(type, (message: T) => { clearTimeout(timer); off(); resolve(message); });
    const timer = setTimeout(() => { off(); reject(new Error(`timeout waiting for "${type}"`)); }, 5_000);
  });
}

it('ends the campaign and keeps the server up when the account file cannot be written', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'impulso-campaign-'));
  const brokenAuth = new AuthService(join(dir, 'data', 'users.json'));
  const vega = await brokenAuth.register('vega-rewards@example.com', 'secret-1234');
  const nova = await brokenAuth.register('nova-rewards@example.com', 'secret-1234');
  rmSync(join(dir, 'data'), { recursive: true });
  writeFileSync(join(dir, 'data'), 'a file where the data folder should be');
  const port = PORT;
  const broken = createGameServer({ auth: brokenAuth, campaign: oneSectorWonByP1 });
  await broken.listen(port, '127.0.0.1');
  const url = `http://127.0.0.1:${port}`;
  const a = await new Client(url).create('campaign', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Vega', token: vega.token });
  const b = await new Client(url).joinById(a.roomId, { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Nova', token: nova.token });
  for (const room of [a, b]) { room.reconnection.enabled = false; room.onMessage('*', () => {}); }
  try {
    const end = next(a, 'campaign_end');
    a.send('ready', envelope({}));
    b.send('ready', envelope({}));
    expect(await end).toMatchObject({ result: { winner: 'p1', reason: 'core' }, reward: { xpGained: 0, saveFailed: true } });
    expect((await fetch(`${url}/health`)).status).toBe(200);
    expect(brokenAuth.profile(vega.user.id).xp).toBe(0);
  } finally {
    await a.leave();
    await b.leave();
    await broken.gracefullyShutdown(false);
    rmSync(dir, { recursive: true, force: true });
  }
});
