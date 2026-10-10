import { TEST_SERVER_URL } from './server-url';
import { Client } from '@colyseus/sdk';
import { expect, test } from '@playwright/test';
import type { PlayerView } from '../../packages/state/src/index';

test('training server remains available to two clients after the old web lobby is removed', async () => {
  const client = new Client(TEST_SERVER_URL);
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
      expect(view.width).toBe(96);
      expect(view.height).toBe(96);
      expect(view.playerId).toBe('p2');
    } finally {
      await second.leave();
    }
  } finally {
    await first.leave();
  }
});

test('opens Sector 01 when the lobby asks for it', async () => {
  const room = await new Client(TEST_SERVER_URL).create('training', { map: 'sector-01' });
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
  const client = new Client(TEST_SERVER_URL);
  const room = await client.create('training', { map: 'sector-01' });
  const next = <T>(type: string): Promise<T> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${type} timeout`)), 5000);
    const off = room.onMessage(type, (value: T) => { clearTimeout(timeout); off(); resolve(value); });
  });
  try {
    const rejected = next<{ reason: string; message: string }>('rejected');
    const offered=await next<PlayerView>('view');
    room.send('augmentPick',{choice:0,id:offered.augments!.offer!.cards[0]!.id});
    await new Promise<void>((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('opening timeout')),5000);
      const off=room.onMessage('view',(view:PlayerView)=>{if(view.augments?.started){clearTimeout(timer);off();resolve();}});
    });
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

test('queues and cancels hangar orders and pauses practice against the AI', async () => {
  type TrainingView = PlayerView & { pausable?: boolean; paused?: boolean };
  const room = await new Client(TEST_SERVER_URL).create('training', { map: 'sector-01' });
  for (const type of ['view', 'augmentOffer', 'augmentChosen', 'ack', 'rejected']) room.onMessage(type, () => {});
  const next = <T>(type: string, accept: (value: T) => boolean = () => true): Promise<T> => new Promise((resolve, reject) => {
    const timeout = setTimeout(() => { off(); reject(new Error(`${type} timeout`)); }, 15000);
    const off = room.onMessage(type, (value: T) => { if (accept(value)) { clearTimeout(timeout); off(); resolve(value); } });
  });
  try {
    const offered = await next<TrainingView>('view', (view) => !!view.augments?.offer);
    const started = next<TrainingView>('view', (view) => !!view.augments?.started);
    room.send('augmentPick', { choice: 0, id: offered.augments!.offer!.cards[0]!.id });
    expect(await started).toMatchObject({ pausable: true, paused: false });

    // A busy hangar takes the second order into its queue, and a cancel gives back what it paid.
    const queued = next<TrainingView>('view', (view) => view.players.p1.queue?.length === 1);
    room.send('command', { seq: 1, type: 'produce', kind: 'explorer' });
    room.send('command', { seq: 2, type: 'produce', kind: 'explorer' });
    const waiting = await queued;
    expect(waiting.players.p1.production).toMatchObject({ kind: 'explorer' });
    const refund = waiting.players.p1.queue![0]!.refund;
    const acked = next<{ seq: number }>('ack', (ack) => ack.seq === 3);
    room.send('command', { seq: 3, type: 'cancel_production', slot: 1, kind: 'explorer' });
    expect(await acked).toEqual({ seq: 3 });
    const cancelled = await next<TrainingView>('view', (view) => view.players.p1.queue?.length === 0);
    expect(cancelled.players.p1.metal).toBeGreaterThanOrEqual(waiting.players.p1.metal! + refund);

    const paused = next<TrainingView>('view', (view) => view.paused === true);
    room.send('pause', { paused: true });
    const frozen = await paused;
    const refused = next<{ reason: string }>('rejected');
    room.send('command', { seq: 4, type: 'stop', squadId: 'p1-interceptor' });
    expect((await refused).reason).toBe('paused');
    const resumed = next<TrainingView>('view', (view) => view.paused === false && view.tick > frozen.tick);
    room.send('pause', { paused: false });
    await resumed;
  } finally {
    await room.leave();
  }
});
