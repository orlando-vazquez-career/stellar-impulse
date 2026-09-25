import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { PROTOCOL_VERSION } from '@impulso/input';
import { createGameServer } from './app.js';

const PORT = 29_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
const joinOptions = (name: string) => ({ protocolVersion: PROTOCOL_VERSION, name });
const envelope = (body: unknown) => ({ protocolVersion: PROTOCOL_VERSION, body });

const server = createGameServer({
  campaign: { countdownMs: 150, transitionMs: 300, resultsMs: 300, resumeCountdownMs: 150, reconnectWindowMs: 3_000 },
});
beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

/** Resolves with the first `type` message accepted by `accept`. */
function next<T = any>(room: Room, type: string, accept: (message: T) => boolean = () => true, timeoutMs = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = room.onMessage(type, (message: T) => {
      if (!accept(message)) return;
      clearTimeout(timer); off(); resolve(message);
    });
    const timer = setTimeout(() => { off(); reject(new Error(`timeout waiting for "${type}"`)); }, timeoutMs);
  });
}
/** Two players seated in a fresh campaign, both ready, sector 1 running. */
async function startCampaign() {
  const host = new Client(URL);
  const guest = new Client(URL);
  const a = await host.create('campaign', joinOptions('Ana'));
  const b = await guest.joinById(a.roomId, joinOptions('Beto'));
  for (const room of [a, b]) room.reconnection.enabled = false;
  const sector = next(a, 'phase', (phase) => phase.phase === 'sector');
  a.send('ready', envelope({}));
  b.send('ready', envelope({}));
  await sector;
  return { a, b, guest };
}

describe('campaign room', () => {
  it('refuses clients speaking another protocol version before seating them', async () => {
    await expect(new Client(URL).create('campaign', { protocolVersion: PROTOCOL_VERSION + 1 }))
      .rejects.toThrow(/unsupported_version/);
  });

  it('runs a two-player campaign and forfeits a player who leaves', async () => {
    const { a, b } = await startCampaign();
    expect((await next(a, 'view')).playerId).toBe('p1');
    const rejected = next(a, 'rejected');
    a.send('command', { seq: 1, type: 'move', squadId: 'p1-interceptor', x: 3, y: 3 });
    expect(await rejected).toMatchObject({ reason: 'invalid_envelope' });
    const end = next(b, 'campaign_end');
    await a.leave();
    expect(await end).toMatchObject({ result: { winner: 'p2', reason: 'forfeit' } });
    await b.leave();
  });

  it('pauses for a dropped player and resumes after a token reconnection', async () => {
    const { a, b, guest } = await startCampaign();
    const token = b.reconnectionToken;
    const paused = next(a, 'phase', (phase) => phase.pause?.by === 'p2');
    await b.leave(false);
    expect((await paused).pause.remainingMs).toBeGreaterThan(0);
    const resumed = next(a, 'phase', (phase) => phase.pause === null && phase.resumeInMs !== null);
    const back = await guest.reconnect(token);
    back.reconnection.enabled = false;
    await resumed;
    expect((await next(back, 'view')).playerId).toBe('p2');
    await a.leave();
    await back.leave();
  });
});
