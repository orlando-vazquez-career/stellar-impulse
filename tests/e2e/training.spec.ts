import { Client } from '@colyseus/sdk';
import { expect, test } from '@playwright/test';
import type { PlayerView } from '../../packages/state/src/index';

test('training server remains available to two clients after the old web lobby is removed', async () => {
  const client = new Client('http://127.0.0.1:2567');
  const first = await client.create('training');
  try {
    const second = await client.joinById(first.roomId);
    try {
      expect(second.roomId).toBe(first.roomId);
      const view = await new Promise<PlayerView>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('training view timeout')), 5000);
        second.onMessage('view', (snapshot: PlayerView) => { clearTimeout(timeout); resolve(snapshot); });
      });
      // Espiral Estelar is the default training map.
      expect(view.width).toBe(58);
      expect(view.height).toBe(58);
      expect(view.playerId).toBe('p2');
    } finally {
      await second.leave();
    }
  } finally {
    await first.leave();
  }
});

test('opens Sector 01 when the lobby asks for it', async () => {
  const room = await new Client('http://127.0.0.1:2567').create('training', { map: 'sector-01' });
  try {
    const view = await new Promise<PlayerView>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('training view timeout')), 5000);
      room.onMessage('view', (snapshot: PlayerView) => { clearTimeout(timeout); resolve(snapshot); });
    });
    expect(view.width).toBe(29);
  } finally {
    await room.leave();
  }
});

test('accepts a move and stop order, acknowledges them, and explains rejected actions', async () => {
  const client = new Client('http://127.0.0.1:2567');
  const room = await client.create('training', { map: 'sector-01' });
  const next = <T>(type: string): Promise<T> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${type} timeout`)), 5000);
    const off = room.onMessage(type, (value: T) => { clearTimeout(timeout); off(); resolve(value); });
  });
  try {
    const rejected = next<{ reason: string; message: string }>('rejected');
    room.send('command', { seq: 1, type: 'attack', squadId: 'p1-interceptor', targetId: 'p1-interceptor' });
    expect(await rejected).toMatchObject({ reason: 'friendly_target', message: 'No puedo hacer eso.' });

    const moved = next<{ seq: number }>('ack');
    room.send('command', { seq: 2, type: 'move', squadId: 'p1-interceptor', x: 5, y: 25 });
    expect(await moved).toEqual({ seq: 2 });

    const stopped = next<{ seq: number }>('ack');
    room.send('command', { seq: 3, type: 'stop', squadId: 'p1-interceptor' });
    expect(await stopped).toEqual({ seq: 3 });
  } finally {
    await room.leave();
  }
});
