import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { decodeBattlefieldMask, type BattlefieldView } from '@impulso/state';
import { createGameServer } from './app.js';

const PORT = 31_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
const options = (name: string) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name });
const envelope = (body: unknown) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body });
const server = createGameServer({ campaign: {
  countdownMs: 0, reconnectWindowMs: 5_000, resumeCountdownMs: 100,
} });

beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

function next<T = any>(room: Room, type: string, accept: (value: T) => boolean = () => true, timeoutMs = 5_000): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = room.onMessage(type, (value: T) => {
      if (!accept(value)) return;
      clearTimeout(timer); off(); resolve(value);
    });
    const timer = setTimeout(() => { off(); reject(new Error(`Timed out waiting for ${type}`)); }, timeoutMs);
  });
}

async function connectedPair() {
  const host = new Client(URL);
  const guest = new Client(URL);
  const a = await host.create('campaign', options('Ana'));
  const b = await guest.joinById(a.roomId, options('Beto'));
  a.reconnection.enabled = false;
  b.reconnection.enabled = false;
  const mapA = next(a, 'map');
  const mapB = next(b, 'map');
  const viewA = next<BattlefieldView>(a, 'view');
  const viewB = next<BattlefieldView>(b, 'view');
  a.send('ready', envelope({}));
  b.send('ready', envelope({}));
  return { a, b, guest, mapA: await mapA, mapB: await mapB, viewA: await viewA, viewB: await viewB };
}

describe('authoritative battlefield over Colyseus', () => {
  it('sends player-specific fog and hides rival state through two real sockets', async () => {
    const { a, b, mapA, mapB, viewA, viewB } = await connectedPair();
    try {
      expect(mapA).toEqual(mapB);
      expect(Object.keys(mapA).sort()).toEqual([
        'protocolVersion', 'mapId', 'version', 'width', 'height', 'cellSize', 'walkable', 'opaque',
      ].sort());
      expect(viewA).toMatchObject({ schemaVersion: 2, mode: 'battlefield', playerId: 'p1' });
      expect(viewB).toMatchObject({ schemaVersion: 2, mode: 'battlefield', playerId: 'p2' });
      const aVisible = decodeBattlefieldMask(viewA.visible);
      const bVisible = decodeBattlefieldMask(viewB.visible);
      expect(aVisible).not.toEqual(bVisible);
      expect(viewA.squads.map((unit) => unit.id)).toContain('p1-interceptor');
      expect(viewA.squads.map((unit) => unit.id)).not.toContain('p2-interceptor');
      expect(viewB.squads.map((unit) => unit.id)).toContain('p2-interceptor');
      expect(viewB.squads.map((unit) => unit.id)).not.toContain('p1-interceptor');
      expect(viewA.players.p1).toHaveProperty('lastSequence', 0);
      expect(viewA.players.p2).not.toHaveProperty('lastSequence');
      expect(viewA.players.p2).not.toHaveProperty('metal');
      expect(viewB.players.p1).not.toHaveProperty('lastSequence');
      expect(viewB.players.p1).not.toHaveProperty('metal');
      expect(viewA.squads[0]).toHaveProperty('route');
      expect(viewB.squads[0]).toHaveProperty('route');

      const missing = next<any>(a, 'rejected');
      a.send('command', envelope({ type: 'stop', seq: 1, squadIds: ['absent-id'] }));
      const missingResult = await missing;
      const enemy = next<any>(a, 'rejected');
      a.send('command', envelope({ type: 'stop', seq: 1, squadIds: ['p2-interceptor'] }));
      expect(await enemy).toEqual(missingResult);
      expect(missingResult.reason).toBe('unit_unavailable');
    } finally {
      await a.leave(); await b.leave();
    }
  });

  it('restores the same explored fog and sequence after reconnecting, with map before view', async () => {
    const { a, b, guest, viewB } = await connectedPair();
    let back: Room | undefined;
    try {
      const token = b.reconnectionToken;
      const ack = next<any>(b, 'ack');
      const moved = next<BattlefieldView>(b, 'view', (view) =>
        view.players.p2.lastSequence === 1 && view.tick >= viewB.tick + 3);
      b.send('command', envelope({ type: 'move_group', seq: 1,
        squadIds: ['p2-interceptor'], x: 61, y: 10 }));
      expect(await ack).toEqual({ protocolVersion: 2, seq: 1 });
      const beforeDrop = await moved;
      const explored = decodeBattlefieldMask(beforeDrop.explored);
      expect(explored.filter(Boolean).length).toBeGreaterThan(
        decodeBattlefieldMask(viewB.explored).filter(Boolean).length);

      const paused = next<any>(a, 'phase', (phase) => phase.pause?.by === 'p2');
      await b.leave(false);
      await paused;
      back = await guest.reconnect(token);
      back.reconnection.enabled = false;
      const received: string[] = [];
      const restoredMap = next(back, 'map', () => { received.push('map'); return true; });
      const restoredView = next<BattlefieldView>(back, 'view', () => { received.push('view'); return true; });
      expect(await restoredMap).toMatchObject({ protocolVersion: 2, mapId: beforeDrop.mapId });
      const restored = await restoredView;
      expect(received.slice(0, 2)).toEqual(['map', 'view']);
      expect(restored.players.p2.lastSequence).toBe(1);
      const restoredExplored = decodeBattlefieldMask(restored.explored);
      expect(explored.every((wasExplored, index) =>
        !wasExplored || restoredExplored[index])).toBe(true);
      expect(restored.squads.find((unit) => unit.id === 'p2-interceptor')).toHaveProperty('route');
    } finally {
      await a.leave();
      if (back) await back.leave();
      else await b.leave().catch(() => {});
    }
  });
});
