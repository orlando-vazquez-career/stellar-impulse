import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import { createBattlefieldWorld, defineMapSpec, type PlayerId } from '@impulso/sim';
import { createGameServer } from './app.js';
import { CampaignRoom } from './campaign-room.js';
import * as campaigns from './campaign/machine.js';
import { AuthService } from './auth.js';

const PORT = 29_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
const auth = new AuthService();
const tokens = {
  Ana: auth.register('ana-campaign@example.com', 'secret-1234').token,
  Beto: auth.register('beto-campaign@example.com', 'secret-1234').token,
};
const joinOptions = (name: 'Ana' | 'Beto') => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name, token: tokens[name] });
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
/** Two players seated in a fresh campaign, both ready, sector 1 running. */
async function startCampaign() {
  const host = new Client(URL);
  const guest = new Client(URL);
  const a = await host.create('campaign', joinOptions('Ana'));
  const b = await guest.joinById(a.roomId, joinOptions('Beto'));
  for (const room of [a, b]) room.reconnection.enabled = false;
  const mapA = next(a, 'map');
  const mapB = next(b, 'map');
  const sector = next(a, 'phase', (phase) => phase.phase === 'sector');
  a.send('ready', envelope({}));
  b.send('ready', envelope({}));
  await sector;
  return { a, b, guest, mapA: await mapA, mapB: await mapB };
}

describe('campaign room', () => {
  it('refuses clients speaking another protocol version before seating them', async () => {
    await expect(new Client(URL).create('campaign', { protocolVersion: 1 }))
      .rejects.toThrow(/unsupported_version/);
  });

  it('runs a two-player campaign and forfeits a player who leaves', async () => {
    const { a, b, mapA, mapB } = await startCampaign();
    const expectedMapKeys = ['protocolVersion', 'mapId', 'version', 'width', 'height', 'cellSize', 'walkable', 'opaque'];
    expect(Object.keys(mapA).sort()).toEqual(expectedMapKeys.sort());
    expect(mapA).toMatchObject({ protocolVersion: 2, mapId: 'battlefield', version: 1,
      width: 72, height: 72, cellSize: 72 });
    expect(mapA).toEqual(mapB);
    expect(mapA.walkable).toHaveLength(72 * 72);
    expect(mapA.opaque).toHaveLength(72 * 72);
    expect((await next(a, 'view')).playerId).toBe('p1');
    const rejected = next(a, 'rejected');
    a.send('command', { seq: 1, type: 'move', squadId: 'p1-interceptor', x: 3, y: 3 });
    expect(await rejected).toMatchObject({ reason: 'invalid_envelope' });
    const end = next(b, 'campaign_end');
    await a.leave();
    expect(await end).toMatchObject({ result: { winner: 'p2', reason: 'forfeit' } });
    await b.leave();
  });

  it('acks accepted sequences and gives identical private-unit rejections', async () => {
    const { a, b } = await startCampaign();
    const oldVersion = next(a, 'rejected');
    a.send('command', { protocolVersion: 1, body: { type: 'stop', seq: 1, squadIds: ['p1-interceptor'] } });
    expect(await oldVersion).toEqual({ protocolVersion: 2, reason: 'unsupported_version' });
    const ack = next(a, 'ack');
    a.send('command', envelope({ type: 'move_group', seq: 1, squadIds: ['p1-interceptor'], x: 9, y: 63 }));
    expect(await ack).toEqual({ protocolVersion: 2, seq: 1 });
    const ownView = next(a, 'view', (view) => view.players.p1.lastSequence === 1);
    expect((await ownView).players.p2).not.toHaveProperty('lastSequence');
    const missing = next(a, 'rejected');
    a.send('command', envelope({ type: 'stop', seq: 2, squadIds: ['nonexistent'] }));
    const missingResult = await missing;
    const rival = next(a, 'rejected');
    a.send('command', envelope({ type: 'stop', seq: 2, squadIds: ['p2-interceptor'] }));
    expect(await rival).toEqual(missingResult);
    expect(missingResult).toEqual({ protocolVersion: 2, reason: 'unit_unavailable' });
    const stale = next(a, 'rejected');
    a.send('command', envelope({ type: 'stop', seq: 1, squadIds: ['p1-interceptor'] }));
    expect(await stale).toEqual({ protocolVersion: 2, reason: 'stale_sequence' });
    await a.leave();
    await b.leave();
  });

  it('weights group and stop commands by squad count for the per-player rate', async () => {
    const { a, b } = await startCampaign();
    const ids = Array.from({ length: 16 }, (_, index) => `unknown-${index}`);
    const fixedNow = Math.floor(Date.now() / 1_000) * 1_000 + 100;
    const clock = vi.spyOn(Date, 'now').mockReturnValue(fixedNow);
    try {
      const results = collect(a, 'rejected', 3);
      a.send('command', envelope({ type: 'move_group', seq: 1, squadIds: ids, x: 10, y: 63 }));
      a.send('command', envelope({ type: 'stop', seq: 2, squadIds: ids }));
      a.send('command', envelope({ type: 'stop', seq: 3, squadIds: ['p1-interceptor'] }));
      expect((await results).map((item) => item.reason)).toEqual([
        'unit_unavailable', 'unit_unavailable', 'rate_limit',
      ]);
    } finally {
      clock.mockRestore();
    }
    await a.leave();
    await b.leave();
  });

  it('shares failed-search expansion costs across players and resets only on world advance', () => {
    const width = 128;
    const height = 128;
    const walkable = Array<boolean>(width * height).fill(true);
    for (let y = 0; y < height; y++) walkable[y * width + 64] = false;
    const map = defineMapSpec({
      id: 'budget-fixture', version: 1, width, height, cellSize: 72,
      bases: { p1: { x: 1, y: 1 }, p2: { x: 126, y: 126 } },
      objectives: [{ id: 'core', kind: 'core', cell: { x: 20, y: 20 },
        guardianId: 'core-guardian', guardianCell: { x: 20, y: 20 } }],
      walkable, opaque: Array<boolean>(width * height).fill(false),
    });
    const campaign = campaigns.createCampaign({ countdownMs: 0,
      createSector: () => createBattlefieldWorld(map) });
    campaigns.join(campaign, 'Ana'); campaigns.join(campaign, 'Beto');
    campaigns.ready(campaign, 'p1', 1_000); campaigns.ready(campaign, 'p2', 1_000);
    campaigns.tick(campaign, 1_000);
    const room = new CampaignRoom();
    const probe = room as unknown as {
      campaign: campaigns.Campaign;
      remainingExpansions: number;
      runCommand: (player: PlayerId, body: unknown) => ReturnType<typeof campaigns.command>;
      syncSearchBudget: () => void;
    };
    probe.campaign = campaign;
    const p1 = { type: 'move_group', seq: 1, squadIds: ['p1-interceptor'], x: 100, y: 100 };
    const p2 = { type: 'move_group', seq: 1, squadIds: ['p2-interceptor'], x: 20, y: 20 };
    const costs = (['p1', 'p2', 'p1', 'p2'] as const).map((player) => {
      const result = probe.runCommand(player, player === 'p1' ? p1 : p2);
      expect(result).toMatchObject({ accepted: false, reason: 'unreachable' });
      return result.expansions;
    });
    expect(costs).toEqual([8192, 8064, 8192, 8064]);
    expect(probe.remainingExpansions).toBe(32768 - costs.reduce((sum, cost) => sum + cost, 0));
    const exhausted = probe.runCommand('p1', p1);
    expect(exhausted).toMatchObject({ accepted: false, reason: 'budget_exceeded' });
    expect(exhausted.expansions).toBe(256);
    expect(probe.remainingExpansions).toBe(0);
    expect(probe.runCommand('p2', p2)).toMatchObject({
      accepted: false, reason: 'budget_exceeded', expansions: 0,
    });
    expect(campaign.world?.players.p1.lastSequence).toBe(0);
    expect(campaign.world?.players.p2.lastSequence).toBe(0);
    campaigns.drop(campaign, 'p2', 1_001);
    probe.syncSearchBudget();
    expect(probe.remainingExpansions).toBe(0);
    campaigns.reconnect(campaign, 'p2', 1_002);
    probe.syncSearchBudget();
    expect(probe.remainingExpansions).toBe(0);
    campaigns.tick(campaign, 1_002 + campaign.config.resumeCountdownMs);
    probe.syncSearchBudget();
    expect(campaign.world?.tick).toBe(1);
    expect(probe.remainingExpansions).toBe(32768);
    campaign.sector = 2;
    campaign.world = createBattlefieldWorld(map);
    probe.syncSearchBudget();
    expect(probe.remainingExpansions).toBe(32768);
  });

  it('resends map metadata before the private view on reconnection', () => {
    const campaign = campaigns.createCampaign({ countdownMs: 0 });
    campaigns.join(campaign, 'Ana'); campaigns.join(campaign, 'Beto');
    campaigns.ready(campaign, 'p1', 1_000); campaigns.ready(campaign, 'p2', 1_000);
    campaigns.tick(campaign, 1_000);
    campaigns.drop(campaign, 'p2', 1_001);
    const room = new CampaignRoom();
    const probe = room as unknown as {
      campaign: campaigns.Campaign;
      seats: Map<string, PlayerId>;
      withinRate: (player: PlayerId, cost: number) => boolean;
    };
    probe.campaign = campaign;
    probe.seats.set('returning', 'p2');
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_002);
    try {
      expect(probe.withinRate('p2', 32)).toBe(true);
      const sent: { type: string; payload: any }[] = [];
      const client = { sessionId: 'returning', send: (type: string, payload: unknown) => sent.push({ type, payload }) };
      room.onReconnect(client as never);
      expect(sent.map((message) => message.type).slice(0, 2)).toEqual(['map', 'view']);
      expect(Object.keys(sent[0]!.payload).sort()).toEqual([
        'protocolVersion', 'mapId', 'version', 'width', 'height', 'cellSize', 'walkable', 'opaque',
      ].sort());
      expect(sent[1]!.payload).toMatchObject({ schemaVersion: 2, mode: 'battlefield', playerId: 'p2' });
      expect(probe.withinRate('p2', 1)).toBe(false);
    } finally {
      clock.mockRestore();
    }
  });

  it('announces a new sector map before its initial view even while paused', () => {
    const nearWin = () => {
      const world = createBattlefieldWorld();
      world.rules.coreOpenTick = 0;
      world.guardians.find((unit) => unit.id === world.core.guardianId)!.hp = 0;
      const squad = world.squads.find((unit) => unit.ownerId === 'p1')!;
      squad.x = world.core.x; squad.y = world.core.y;
      world.core.progress.p1 = world.rules.coreCaptureTicks - 1;
      return world;
    };
    const campaign = campaigns.createCampaign({ countdownMs: 0, transitionMs: 100, createSector: nearWin });
    campaigns.join(campaign, 'Ana'); campaigns.join(campaign, 'Beto');
    campaigns.ready(campaign, 'p1', 1_000); campaigns.ready(campaign, 'p2', 1_000);
    campaigns.tick(campaign, 1_000);
    campaigns.tick(campaign, 1_001);
    expect(campaign.phase).toBe('transition');
    campaigns.drop(campaign, 'p2', 1_002);
    const room = new CampaignRoom();
    const probe = room as unknown as {
      campaign: campaigns.Campaign;
      seats: Map<string, PlayerId>;
      clients: unknown[];
      step: () => void;
    };
    probe.campaign = campaign;
    const sent: { type: string; payload: any }[] = [];
    const client = { sessionId: 'connected', send: (type: string, payload: unknown) => sent.push({ type, payload }) };
    probe.seats.set('connected', 'p1');
    probe.clients.push(client);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_101);
    try { probe.step(); } finally { clock.mockRestore(); }
    expect(campaign.phase).toBe('sector');
    expect(campaign.pause).toEqual({ by: 'p2', until: 61_002 });
    expect(campaign.world?.tick).toBe(0);
    expect(sent.map((message) => message.type).slice(0, 2)).toEqual(['map', 'view']);
    expect(sent[1]!.payload).toMatchObject({ schemaVersion: 2, mode: 'battlefield', playerId: 'p1', tick: 0 });
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
