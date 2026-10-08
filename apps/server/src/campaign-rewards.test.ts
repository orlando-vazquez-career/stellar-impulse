import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createGameServer } from './app.js';
import * as campaigns from './campaign/machine.js';
import { AuthService } from './auth.js';

const PORT = 31_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
const auth = new AuthService();
const ana = await auth.register('ana-rewards@example.com', 'secret-1234');
const beto = await auth.register('beto-rewards@example.com', 'secret-1234');
const envelope = (body: unknown) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body });

// One sector whose core already belongs to p1: the campaign ends on its first tick.
const oneSectorWonByP1: Partial<campaigns.CampaignConfig> = {
  sectors: 1, countdownMs: 100, resultsMs: 2_000,
  createSector: (sector) => ({ ...campaigns.DEFAULT_CONFIG.createSector(sector), winner: 'p1' }),
};
const server = createGameServer({ auth, campaign: oneSectorWonByP1 });
beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

function next<T = any>(room: Room, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = room.onMessage(type, (message: T) => { clearTimeout(timer); off(); resolve(message); });
    const timer = setTimeout(() => { off(); reject(new Error(`timeout waiting for "${type}"`)); }, 5_000);
  });
}

it('saves campaign XP for both accounts and tells each player its own reward', async () => {
  const a = await new Client(URL).create('campaign', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Ana', token: ana.token });
  const b = await new Client(URL).joinById(a.roomId, { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Beto', token: beto.token });
  for (const room of [a, b]) { room.reconnection.enabled = false; room.onMessage('*', () => {}); }
  try {
    const endA = next(a, 'campaign_end');
    const endB = next(b, 'campaign_end');
    a.send('ready', envelope({}));
    b.send('ready', envelope({}));
    const [mine, theirs] = await Promise.all([endA, endB]);
    expect(mine).toMatchObject({ result: { winner: 'p1', reason: 'core' }, reward: { xpGained: 125, beforeXp: 0 } });
    expect(theirs).toMatchObject({ result: { winner: 'p1', reason: 'core' }, reward: { xpGained: 40, beforeXp: 0 } });
    expect(auth.profile(ana.user.id).xp).toBe(125);
    expect(auth.profile(beto.user.id).xp).toBe(40);
  } finally {
    await a.leave();
    await b.leave();
  }
});
