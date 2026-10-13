import { afterAll, beforeAll, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createMatchWorld } from '@impulso/sim';
import { createGameServer } from '../../src/app.js';
import { AuthService } from '../../src/auth.js';

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

it('finishes the multiplayer campaign after its single map', async () => {
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
    const finalA = next(a, 'campaign_end');
    const finalB = next(b, 'campaign_end');
    const results = next(a, 'phase', (phase) => phase.phase === 'results');
    a.send('augmentPick', envelope({ choice: offerA.choice, id: pickA }));
    b.send('augmentPick', envelope({ choice: offerB.choice, id: offerB.cards[0].id }));
    expect(await results).toMatchObject({ sector: 1, sectors: 1, sectorResults: [{ sector: 1, winner: null }] });
    const [endA, endB] = await Promise.all([finalA, finalB]);
    expect(endA).toMatchObject({ result: { winner: null, reason: 'draw' }, sectorResults: [{ sector: 1, winner: null }] });
    expect(endB).toMatchObject({ result: { winner: null, reason: 'draw' }, sectorResults: [{ sector: 1, winner: null }] });
  } finally {
    await a.leave();
    await b.leave();
  }
});

it('plays all three sectors when the host selects the full multiplayer campaign', async () => {
  const a = await new Client(URL).create('campaign', {
    protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Vega', token: vega.token, map: 'espiral', campaignMode: 'campaign',
  });
  const b = await new Client(URL).joinById(a.roomId, { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Nova', token: nova.token });
  for (const room of [a, b]) { room.reconnection.enabled = false; room.onMessage('*', () => {}); }
  try {
    const firstPhase = next(a, 'phase', (phase) => phase.phase === 'sector');
    const firstViewA = next(a, 'view', (view) => view.augments?.offer !== undefined);
    const firstViewB = next(b, 'view', (view) => view.augments?.offer !== undefined);
    a.send('ready', envelope({}));
    b.send('ready', envelope({}));
    expect(await firstPhase).toMatchObject({ sector: 1, sectors: 3 });
    let [viewA, viewB] = await Promise.all([firstViewA, firstViewB]);

    for (let sector = 1; sector <= 3; sector++) {
      const startedA = next(a, 'view', (view) => view.augments?.started === true);
      const startedB = next(b, 'view', (view) => view.augments?.started === true);
      a.send('augmentPick', envelope({ choice: viewA.augments.offer.choice, id: viewA.augments.offer.cards[0].id }));
      b.send('augmentPick', envelope({ choice: viewB.augments.offer.choice, id: viewB.augments.offer.cards[0].id }));
      await Promise.all([startedA, startedB]);

      if (sector < 3) {
        const transitionA = next(a, 'phase', (phase) => phase.phase === 'transition' && phase.sector === sector);
        const transitionB = next(b, 'phase', (phase) => phase.phase === 'transition' && phase.sector === sector);
        const nextPhaseA = next(a, 'phase', (phase) => phase.phase === 'sector' && phase.sector === sector + 1);
        const nextPhaseB = next(b, 'phase', (phase) => phase.phase === 'sector' && phase.sector === sector + 1);
        const nextViewA = next(a, 'view', (view) => view.augments?.offer?.choice === Math.min(sector, 2));
        const nextViewB = next(b, 'view', (view) => view.augments?.offer?.choice === Math.min(sector, 2));
        await Promise.all([transitionA, transitionB, nextPhaseA, nextPhaseB]);
        [viewA, viewB] = await Promise.all([nextViewA, nextViewB]);
      } else {
        const results = next(a, 'phase', (phase) => phase.phase === 'results');
        const finalA = next(a, 'campaign_end');
        const finalB = next(b, 'campaign_end');
        expect(await results).toMatchObject({ sector: 3, sectors: 3, sectorResults: [
          { sector: 1, winner: null }, { sector: 2, winner: null }, { sector: 3, winner: null },
        ] });
        expect(await finalA).toMatchObject({ result: { winner: null, reason: 'draw' }, sectorResults: [
          { sector: 1 }, { sector: 2 }, { sector: 3 },
        ] });
        expect(await finalB).toMatchObject({ result: { winner: null, reason: 'draw' }, sectorResults: [
          { sector: 1 }, { sector: 2 }, { sector: 3 },
        ] });
      }
    }
  } finally {
    await a.leave();
    await b.leave();
  }
});
