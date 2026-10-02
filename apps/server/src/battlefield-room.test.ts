import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createGameServer } from './app.js';

const PORT = 32_000 + Math.floor(Math.random() * 800);
const URL = `http://127.0.0.1:${PORT}`;
const envelope = (body: unknown) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body });
const server = createGameServer();

beforeAll(async () => { await server.listen(PORT, '127.0.0.1'); });
afterAll(async () => { await server.gracefullyShutdown(false); });

function next<T = any>(room: Room, type: string, accept: (value: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = room.onMessage(type, (value: T) => {
      if (!accept(value)) return;
      clearTimeout(timer);
      off();
      resolve(value);
    });
    const timer = setTimeout(() => {
      off();
      reject(new Error(`Timed out waiting for ${type}`));
    }, 5_000);
  });
}

describe('battlefield room', () => {
  it('publishes the Sector 01 map and accepts only versioned authoritative commands', async () => {
    const client = new Client(URL);
    const room = await client.joinOrCreate('battlefield', {
      protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
      name: 'Ana',
    });
    room.reconnection.enabled = false;
    room.onMessage('view', () => undefined);
    try {
      const initial = next<any>(room, 'view');
      const map = next<any>(room, 'map');
      room.send('ready');
      const mapPayload = await map;
      expect(mapPayload).toMatchObject({ protocolVersion: 2, mapId: 'sector-01', width: 29, height: 29 });
      expect(mapPayload.walkable).toHaveLength(29 * 29);
      expect(mapPayload.level).toHaveLength(29 * 29);
      expect(mapPayload.ramp).toHaveLength(29 * 29);

      const initialPayload = await initial;
      expect(initialPayload).toMatchObject({ schemaVersion: 2, mode: 'battlefield', playerId: 'p1' });
      expect(initialPayload.squads.map((unit: { id: string }) => unit.id)).toContain('p1-interceptor');
      expect(initialPayload.squads.map((unit: { id: string }) => unit.id)).not.toContain('p2-interceptor');

      const rejected = next<any>(room, 'rejected');
      room.send('command', { seq: 1, type: 'stop', squadId: 'p1-interceptor' });
      expect(await rejected).toMatchObject({ protocolVersion: 2, reason: 'invalid_envelope' });

      const ack = next<any>(room, 'ack');
      const updated = next<any>(room, 'view', (view) => view.players.p1.lastSequence === 1);
      room.send('command', envelope({ type: 'stop', seq: 1, squadIds: ['p1-interceptor'] }));
      expect(await ack).toEqual({ protocolVersion: 2, seq: 1 });
      expect(await updated).toMatchObject({ players: { p1: { lastSequence: 1 } } });
    } finally {
      await room.leave();
    }
  });

  it('forfeits the match when a connected player leaves', async () => {
    const host = new Client(URL);
    const guest = new Client(URL);
    const a = await host.joinOrCreate('battlefield', { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Ana' });
    const b = await guest.joinById(a.roomId, { protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name: 'Beto' });
    a.reconnection.enabled = false;
    b.reconnection.enabled = false;
    a.onMessage('view', () => undefined);
    b.onMessage('view', () => undefined);
    const map = next<any>(a, 'map');
    a.send('ready');
    await map;
    const bView = next<any>(b, 'view', (view) => view.winner === 'p2');
    const bMap = next<any>(b, 'map');
    b.send('ready');
    await bMap;
    try {
      await a.leave();
      expect(await bView).toMatchObject({ playerId: 'p2', winner: 'p2' });
    } finally {
      await b.leave();
    }
  });

  it('starts the authoritative tick after one client completes the ready handshake', async () => {
    const client = new Client(URL);
    const room = await client.joinOrCreate('battlefield', {
      protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
      name: 'Demo',
    });
    room.reconnection.enabled = false;
    room.onMessage('view', () => undefined);
    try {
      const initial = next<any>(room, 'view');
      room.send('ready');
      const first = await initial;
      const ticked = next<any>(room, 'view', (view) => view.tick > first.tick);
      expect((await ticked).tick).toBeGreaterThan(first.tick);
    } finally {
      await room.leave();
    }
  });

  it('moves a ship from a high-level command and publishes the authoritative position', async () => {
    const client = new Client(URL);
    const room = await client.joinOrCreate('battlefield', {
      protocolVersion: CAMPAIGN_PROTOCOL_VERSION,
      name: 'Mover',
    });
    room.reconnection.enabled = false;
    room.onMessage('view', () => undefined);
    try {
      const initial = next<any>(room, 'view');
      room.send('ready');
      const first = await initial;
      const ack = next<any>(room, 'ack');
      const moved = next<any>(room, 'view', (view) => {
        const ship = view.squads.find((unit: { id: string }) => unit.id === 'p1-interceptor');
        return view.players.p1.lastSequence === 1 && Boolean(ship && (ship.x !== 3 || ship.y !== 3));
      });
      room.send('command', envelope({ type: 'move_group', seq: 1, squadIds: ['p1-interceptor'], x: 4, y: 3 }));
      expect(await ack).toEqual({ protocolVersion: 2, seq: 1 });
      const view = await moved;
      expect(view.squads.find((unit: { id: string }) => unit.id === 'p1-interceptor')).not.toMatchObject({ x: 3, y: 3 });
      expect(view.tick).toBeGreaterThan(first.tick);
    } finally {
      await room.leave();
    }
  });
});
