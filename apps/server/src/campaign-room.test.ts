import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createGameServer } from './app.js';
import { AuthService } from './auth.js';

const PORT = 29_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
const auth = new AuthService();
const tokens = {
  Ana: (await auth.register('ana-campaign@example.com', 'secret-1234')).token,
  Beto: (await auth.register('beto-campaign@example.com', 'secret-1234')).token,
  Caro: (await auth.register('caro-campaign@example.com', 'secret-1234')).token,
};
/** Sector 01 keeps these sockets fast; the default campaign map is Espiral. */
const joinOptions = (name: keyof typeof tokens) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name, token: tokens[name], map: 'sector-01' });
const envelope = (body: unknown) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body });

const server = createGameServer({
  auth,
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
function collect<T = any>(room: Room, type: string, count: number, timeoutMs = 5_000): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const values: T[] = [];
    const off = room.onMessage(type, (message: T) => {
      values.push(message);
      if (values.length === count) { clearTimeout(timer); off(); resolve(values); }
    });
    const timer = setTimeout(() => { off(); reject(new Error(`timeout collecting "${type}"`)); }, timeoutMs);
  });
}
/** Two seated players, both ready; sector 1 is waiting for its opening augment picks. */
async function startCampaign() {
  const host = new Client(URL);
  const guest = new Client(URL);
  const a = await host.create('campaign', joinOptions('Ana'));
  const b = await guest.joinById(a.roomId, joinOptions('Beto'));
  for (const room of [a, b]) room.reconnection.enabled = false;
  const sector = next(a, 'phase', (phase) => phase.phase === 'sector');
  const viewA = next(a, 'view', (view) => view.augments?.offer);
  const viewB = next(b, 'view', (view) => view.augments?.offer);
  a.send('ready', envelope({}));
  b.send('ready', envelope({}));
  return { a, b, guest, phase: await sector, viewA: await viewA, viewB: await viewB };
}
/** Both players take the first card of their opening offer and the sector starts running. */
async function pickOpenings(a: Room, b: Room, viewA: any, viewB: any) {
  const running = next(a, 'view', (view) => view.augments?.started === true);
  a.send('augmentPick', envelope({ choice: viewA.augments.offer.choice, id: viewA.augments.offer.cards[0].id }));
  b.send('augmentPick', envelope({ choice: viewB.augments.offer.choice, id: viewB.augments.offer.cards[0].id }));
  return running;
}

describe('campaign room', () => {
  it('refuses clients speaking another protocol version before seating them', async () => {
    await expect(new Client(URL).create('campaign', { protocolVersion: 2 }))
      .rejects.toThrow(/unsupported_version/);
  });

  it('identifies each player in the lobby even when both use the same alias', async () => {
    const a = await new Client(URL).create('campaign', { ...joinOptions('Ana'), name: 'Comandante' });
    const b = await new Client(URL).joinById(a.roomId, { ...joinOptions('Beto'), name: 'Comandante' });
    for (const room of [a, b]) room.reconnection.enabled = false;
    try {
      const [phaseA, phaseB] = await Promise.all([next(a, 'phase'), next(b, 'phase')]);
      expect(phaseA).toMatchObject({ phase: 'lobby', playerId: 'p1' });
      expect(phaseB).toMatchObject({ phase: 'lobby', playerId: 'p2' });
      expect(phaseA.seats).toEqual(phaseB.seats);
    } finally {
      await a.leave(); await b.leave();
    }
  });

  it('reuses a departed lobby seat without changing the remaining player identity', async () => {
    const a = await new Client(URL).create('campaign', joinOptions('Ana'));
    const b = await new Client(URL).joinById(a.roomId, joinOptions('Beto'));
    for (const room of [a, b]) room.reconnection.enabled = false;
    let c: Room | null = null;
    try {
      const vacancy = next(b, 'phase', (phase) => phase.seats.p1 === null);
      await a.leave();
      expect(await vacancy).toMatchObject({ phase: 'lobby', playerId: 'p2' });
      c = await new Client(URL).joinById(b.roomId, joinOptions('Caro'));
      c.reconnection.enabled = false;
      const phase = await next(c, 'phase');
      expect(phase).toMatchObject({ playerId: 'p1', seats: { p1: { name: 'Caro' }, p2: { name: 'Beto' } } });
    } finally {
      await c?.leave(); await b.leave();
    }
  });

  it('starts sector 1 on the match engine with a private view and a silver opening offer per player', async () => {
    const { a, b, phase, viewA, viewB } = await startCampaign();
    try {
      expect(phase).toMatchObject({ protocolVersion: 3, playerId: 'p1', sector: 1, sectors: 3, renderMap: 'sector-01' });
      expect(viewA).toMatchObject({ protocolVersion: 3, mode: 'training', playerId: 'p1' });
      expect(viewB).toMatchObject({ protocolVersion: 3, mode: 'training', playerId: 'p2' });
      expect(viewA.augments.offer.tier).toBe('silver');
      expect(viewA.augments.started).toBe(false);
      expect(viewA.players.p1.metal).toEqual(expect.any(Number));
      expect(viewA.players.p2).not.toHaveProperty('metal');
      expect(viewB.players.p1).not.toHaveProperty('metal');
      expect(JSON.stringify(viewA)).not.toContain(JSON.stringify(viewB.augments.offer.cards));
    } finally {
      await a.leave(); await b.leave();
    }
  });

  it('applies orders after the opening picks, acks them and rejects bad ones', async () => {
    const { a, b, viewA, viewB } = await startCampaign();
    try {
      const early = next(a, 'rejected');
      a.send('command', envelope({ seq: 1, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' }));
      expect(await early).toMatchObject({ protocolVersion: 3, reason: 'opening_selection' });
      await pickOpenings(a, b, viewA, viewB);
      const ack = next(a, 'ack');
      a.send('command', envelope({ seq: 1, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' }));
      expect(await ack).toEqual({ protocolVersion: 3, seq: 1 });
      const stale = next(a, 'rejected');
      a.send('command', envelope({ seq: 1, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' }));
      expect(await stale).toMatchObject({ protocolVersion: 3, reason: 'stale_sequence' });
      const rival = next(a, 'rejected');
      a.send('command', envelope({ seq: 2, type: 'stance', squadId: 'p2-interceptor', stance: 'guard' }));
      expect(await rival).toEqual({ protocolVersion: 3, reason: 'not_owner' });
      const oldVersion = next(a, 'rejected');
      a.send('command', { protocolVersion: 2, body: { seq: 3, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' } });
      expect(await oldVersion).toEqual({ protocolVersion: 3, reason: 'unsupported_version' });
      const bare = next(a, 'rejected');
      a.send('command', { seq: 3, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' });
      expect(await bare).toMatchObject({ reason: 'invalid_envelope' });
      const badPick = next(a, 'rejected');
      a.send('augmentPick', envelope({ choice: 0, id: 'not a card' }));
      expect(await badPick).toMatchObject({ reason: 'invalid_augment_pick' });
    } finally {
      await a.leave(); await b.leave();
    }
  });

  it('weights group orders by squad count for the per-player rate', async () => {
    const { a, b, viewA, viewB } = await startCampaign();
    await pickOpenings(a, b, viewA, viewB);
    const ids = Array.from({ length: 16 }, (_, index) => `unknown-${index}`);
    const fixedNow = Math.floor(Date.now() / 1_000) * 1_000 + 100;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      const results = collect(a, 'rejected', 3);
      a.send('command', envelope({ seq: 1, type: 'move_formation', squadIds: ids, x: 10, y: 10, formation: 'line' }));
      a.send('command', envelope({ seq: 2, type: 'disband', squadIds: ids }));
      a.send('command', envelope({ seq: 3, type: 'stance', squadId: 'p1-interceptor', stance: 'guard' }));
      const reasons = (await results).map((item) => item.reason);
      expect(reasons[2]).toBe('rate_limit');
      expect(reasons.slice(0, 2)).not.toContain('rate_limit');
    } finally {
      clock.mockRestore();
    }
    await a.leave();
    await b.leave();
  });

  it('forfeits the campaign of a player who leaves', async () => {
    const { a, b } = await startCampaign();
    const end = next(b, 'campaign_end');
    await a.leave();
    expect(await end).toMatchObject({ protocolVersion: 3, result: { winner: 'p2', reason: 'forfeit' } });
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
    const view = await next(back, 'view');
    expect(view.playerId).toBe('p2');
    expect(view.augments.offer.tier).toBe('silver');
    await a.leave();
    await back.leave();
  });
});
