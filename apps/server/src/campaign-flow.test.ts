import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createMatchWorld } from '@impulso/sim';
import { createGameServer } from './app.js';
import { AuthService } from './auth.js';

// Own file: Colyseus keeps one matchmaker per process. Sectors end by draw after 2 s of play.
const PORT = 33_900 + Math.floor(Math.random() * 90);
const URL = `http://127.0.0.1:${PORT}`;
const auth = new AuthService();
const vega = await auth.register('vega-flow@example.com', 'Secret-1234');
const nova = await auth.register('nova-flow@example.com', 'Secret-1234');
const envelope = (body: unknown) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body });
const server = createGameServer({
  auth,
  campaign: { createSector: (_sector, seed) => createMatchWorld('sector-01', 'skirmish', seed), countdownMs: 100, transitionMs: 300, resultsMs: 2_000, sectorLimitTicks: 20 },
});
beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

function next<T = any>(room: Room, type: string, accept: (message: T) => boolean = () => true, timeoutMs = 10_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = room.onMessage(type, (message: T) => {
      if (!accept(message)) return;
      clearTimeout(timer); off(); resolve(message);
    });
    const timer = setTimeout(() => { off(); reject(new Error(`timeout waiting for "${type}"`)); }, timeoutMs);
  });
}

it('carries each pick into the next sector and opens it with the next tier', async () => {
  const a = await new Client(URL).create('campaign', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Vega', token: vega.token, map: 'espiral' });
  const b = await new Client(URL).joinById(a.roomId, { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Nova', token: nova.token });
  for (const room of [a, b]) { room.reconnection.enabled = false; room.onMessage('*', () => {}); }
  try {
    const firstA = next(a, 'view', (view) => view.augments?.offer?.tier === 'silver');
    const firstB = next(b, 'view', (view) => view.augments?.offer?.tier === 'silver');
    a.send('ready', envelope({}));
    b.send('ready', envelope({}));
    const [offerA, offerB] = [(await firstA).augments.offer, (await firstB).augments.offer];
    const pickA = offerA.cards[0].id;
    const secondA = next(a, 'view', (view) => view.augments?.offer?.tier === 'gold');
    const transition = next(a, 'phase', (phase) => phase.phase === 'transition');
    a.send('augmentPick', envelope({ choice: offerA.choice, id: pickA }));
    b.send('augmentPick', envelope({ choice: offerB.choice, id: offerB.cards[0].id }));
    expect((await transition).sectorResults).toEqual([{ sector: 1, winner: null }]);
    const sector2 = await secondA;
    expect(sector2.augments.own.map((card: { id: string }) => card.id)).toEqual([pickA]);
    expect(sector2.augments.started).toBe(false);
    expect(sector2.tick).toBe(0);
  } finally {
    await a.leave();
    await b.leave();
  }
});
