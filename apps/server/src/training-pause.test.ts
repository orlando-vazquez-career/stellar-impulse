import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import type { PlayerView } from '@impulso/state';
import { AuthService } from './auth';
import { createGameServer } from './app';

// Test rooms may speed up their clock (testTimeScale) so a match reaches its surrender window quickly.
process.env.GAME_TEST_MODE = '1';
const port = 36_000 + Math.floor(Math.random() * 900), url = `http://127.0.0.1:${port}`;
const server = createGameServer({ auth: new AuthService() });
beforeAll(() => server.listen(port, '127.0.0.1'));
afterAll(() => server.gracefullyShutdown(false));

type TrainingView = PlayerView & { pausable?: boolean; paused?: boolean };
function next<T>(room: Room, type: string, accept: (value: T) => boolean = () => true, ms = 8000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { off(); reject(Error(`Missing ${type}`)); }, ms);
    const off = room.onMessage(type, (value: T) => { if (accept(value)) { clearTimeout(timer); off(); resolve(value); } });
  });
}
/** The next `count` views, in order. */
function views(room: Room, count: number): Promise<TrainingView[]> {
  return new Promise((resolve, reject) => {
    const seen: TrainingView[] = [];
    const timer = setTimeout(() => { off(); reject(Error('Missing views')); }, 8000);
    const off = room.onMessage('view', (value: TrainingView) => {
      seen.push(value);
      if (seen.length === count) { clearTimeout(timer); off(); resolve(seen); }
    });
  });
}
function quiet(room: Room): void {
  for (const type of ['view', 'augmentOffer', 'augmentChosen', 'ack', 'rejected']) room.onMessage(type, () => {});
}
/** Takes the first opening card and waits until the battle clock runs. */
async function open(room: Room, offered: TrainingView): Promise<TrainingView> {
  const running = next<TrainingView>(room, 'view', (view) => !!view.augments?.started && view.tick > offered.tick);
  room.send('augmentPick', { choice: 0, id: offered.augments!.offer!.cards[0]!.id });
  return running;
}
async function practice(options: Record<string, unknown> = {}): Promise<{ room: Room; view: TrainingView }> {
  const room = await new Client(url).create('training', { map: 'sector-01', ...options });
  quiet(room);
  const offered = await next<TrainingView>(room, 'view', (view) => !!view.augments?.offer);
  return { room, view: await open(room, offered) };
}

describe('pause in practice against the AI', () => {
  it('stops the clock, refuses orders while stopped and starts it again', async () => {
    const { room, view } = await practice();
    try {
      expect(view).toMatchObject({ pausable: true, paused: false });
      const stopped = next<TrainingView>(room, 'view', (value) => value.paused === true);
      room.send('pause', { paused: true });
      const frozen = await stopped;
      const held = await views(room, 4);
      for (const later of held) expect(later).toMatchObject({ tick: frozen.tick, paused: true, pausable: true });
      const refused = next<{ reason: string; message: string }>(room, 'rejected');
      room.send('command', { seq: 1, type: 'stop', squadId: 'p1-interceptor' });
      expect(await refused).toEqual({ reason: 'paused', message: 'Partida en pausa.' });
      const resumed = next<TrainingView>(room, 'view', (value) => value.paused === false && value.tick > frozen.tick);
      room.send('pause', { paused: false });
      expect(await resumed).toMatchObject({ pausable: true, paused: false });
    } finally { await room.leave(); }
  }, 30_000);

  it('does not count the orders refused during a pause against the rate limit', async () => {
    const { room } = await practice();
    try {
      const stopped = next<TrainingView>(room, 'view', (value) => value.paused === true);
      room.send('pause', { paused: true });
      const frozen = await stopped;
      for (let seq = 1; seq <= 40; seq += 1) room.send('command', { seq, type: 'stop', squadId: 'p1-interceptor' });
      await views(room, 2);
      const resumed = next<TrainingView>(room, 'view', (value) => value.paused === false && value.tick > frozen.tick);
      room.send('pause', { paused: false });
      await resumed;
      const limited = next<{ reason: string }>(room, 'rejected', (value) => value.reason === 'rate_limit', 1500).then(() => true, () => false);
      const acked = next<{ seq: number }>(room, 'ack', (value) => value.seq === 41);
      room.send('command', { seq: 41, type: 'stop', squadId: 'p1-interceptor' });
      expect(await acked).toEqual({ seq: 41 });
      expect(await limited).toBe(false);
    } finally { await room.leave(); }
  }, 30_000);

  it('refuses a pause once a second human joins, and the second human starts the clock again', async () => {
    // The AI takes its opening card on the first tick, and then no human may join. A test room that opens paused
    // keeps that seat free for the guest without racing the 100 ms simulation clock.
    const host = await new Client(url).create('training', { map: 'sector-01', testPaused: true });
    quiet(host);
    const held = await next<TrainingView>(host, 'view', (value) => value.paused === true);
    expect(held.augments!.rival).toEqual([]);
    expect((await views(host, 2)).map((later) => later.tick)).toEqual([held.tick, held.tick]);
    const guest = await new Client(url).joinById(host.roomId);
    quiet(guest);
    try {
      const both = await next<TrainingView>(host, 'view', (value) => value.paused === false);
      // The handshake stays on: the room has the handler, and the refusal says the pause is not available now.
      expect(both.pausable).toBe(true);
      const refused = next<{ reason: string; message: string }>(host, 'rejected');
      host.send('pause', { paused: true });
      expect(await refused).toEqual({ reason: 'pause_unavailable', message: 'La pausa no está disponible en esta partida.' });
      const guestOffer = await next<TrainingView>(guest, 'view', (value) => !!value.augments?.offer);
      const hostOffer = await next<TrainingView>(host, 'view', (value) => !!value.augments?.offer);
      guest.send('augmentPick', { choice: 0, id: guestOffer.augments!.offer!.cards[0]!.id });
      const running = await open(host, hostOffer);
      const later = await next<TrainingView>(host, 'view', (value) => value.tick > running.tick + 2);
      expect(later).toMatchObject({ paused: false, pausable: true });
    } finally { await guest.leave(); await host.leave(); }
  }, 40_000);

  it('opens a test room paused only against the AI', async () => {
    const room = await new Client(url).create('training', { map: 'sector-01', opponent: 'human', testPaused: true });
    quiet(room);
    try {
      expect((await views(room, 2)).every((later) => later.paused === false)).toBe(true);
    } finally { await room.leave(); }
  }, 30_000);

  it('refuses a pause in a match between humans', async () => {
    const room = await new Client(url).create('training', { map: 'sector-01', opponent: 'human' });
    quiet(room);
    try {
      const view = await next<TrainingView>(room, 'view');
      expect(view.pausable).toBe(true);
      const refused = next<{ reason: string }>(room, 'rejected');
      room.send('pause', { paused: true });
      expect((await refused).reason).toBe('pause_unavailable');
      expect((await views(room, 2)).every((later) => later.paused === false)).toBe(true);
    } finally { await room.leave(); }
  }, 30_000);

  it('refuses a pause once the match is decided', async () => {
    const { room } = await practice({ testTimeScale: 30 });
    try {
      await next<TrainingView>(room, 'view', (value) => value.tick >= 1500, 25_000);
      const decided = next<TrainingView>(room, 'view', (value) => value.winner !== null);
      room.send('command', { seq: 1, type: 'surrender' });
      expect((await decided).winner).toBe('p2');
      const refused = next<{ reason: string }>(room, 'rejected');
      room.send('pause', { paused: true });
      expect((await refused).reason).toBe('pause_unavailable');
      for (const later of await views(room, 3)) expect(later).toMatchObject({ paused: false, pausable: true });
    } finally { await room.leave(); }
  }, 60_000);
});
