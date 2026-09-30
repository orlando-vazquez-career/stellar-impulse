import { cpus, platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { describe, expect, it } from 'vitest';
import { Client, type Room } from '@colyseus/sdk';
import { getMessageBytes, Protocol } from '@colyseus/core';
import { CAMPAIGN_PROTOCOL_VERSION } from '@impulso/input';
import {
  applyBattlefieldCommand, BATTLEFIELD_MAP, createBattlefieldWorld, defineMapSpec, stepBattlefieldWorld,
  type BattlefieldWorld, type MapSpec, type PlayerId,
} from '@impulso/sim';
import { battlefieldViewFor } from '@impulso/state';
import { createGameServer } from './app.js';
import { CampaignRoom } from './campaign-room.js';
import * as campaigns from './campaign/machine.js';

/** Run explicitly with `pnpm exec vitest run apps/server/src/map-benchmark.test.ts`.
 * Durations are reported, not CI assertions; deterministic operation budgets are asserted.
 */
const SEED = 0x5e11e;
const SIDE = 72;
const ACTIONS_PER_PLAYER_PER_BURST = 32;
const SEARCH_BUDGET_PER_TICK = 32768;
const PORT = 32_000 + Math.floor(Math.random() * 900);
const URL = `http://127.0.0.1:${PORT}`;
const envelope = (body: unknown) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, body });
const joins = (name: string) => ({ protocolVersion: CAMPAIGN_PROTOCOL_VERSION, name });

function random(seed: number) {
  let state = seed >>> 0;
  return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 2 ** 32; };
}

function fixture(obstacles: boolean): BattlefieldWorld {
  const roll = random(SEED);
  const walkable = Array<boolean>(SIDE * SIDE).fill(true);
  const opaque = Array<boolean>(SIDE * SIDE).fill(false);
  if (obstacles) {
    for (let y = 10; y < 62; y++) for (let x = 12; x < 60; x++) {
      const nearGoal = (x >= 26 && x <= 44 && y >= 20 && y <= 51);
      const blocked = !nearGoal && y % 9 !== 0 && roll() < 0.22;
      walkable[y * SIDE + x] = !blocked;
      opaque[y * SIDE + x] = blocked;
    }
  }
  const map: MapSpec = obstacles ? defineMapSpec({
    id: obstacles ? 'benchmark-obstacles' : 'benchmark-open', version: 1,
    width: SIDE, height: SIDE, cellSize: 72,
    bases: { p1: { x: 8, y: 63 }, p2: { x: 63, y: 8 } },
    objectives: [
      { id: 'metal-one', kind: 'metal', cell: { x: 30, y: 46 },
        guardianId: 'guardian-one', guardianCell: { x: 30, y: 46 } },
      { id: 'metal-two', kind: 'metal', cell: { x: 42, y: 26 },
        guardianId: 'guardian-two', guardianCell: { x: 42, y: 26 } },
      { id: 'core', kind: 'core', cell: { x: 36, y: 36 },
        guardianId: 'core-guardian', guardianCell: { x: 36, y: 36 } },
    ],
    walkable, opaque,
  }) : BATTLEFIELD_MAP;
  const world = createBattlefieldWorld(map, { coreOpenTick: 100_000, attackEveryTicks: 100_000 });
  world.guardians.forEach((guardian) => { guardian.hp = 0; });
  // Exactly 64 distinct live cells per side. The seeded shuffle prevents a hand-picked route order.
  world.squads = (['p1', 'p2'] as const).flatMap((ownerId) => {
    const cells = Array.from({ length: 64 }, (_, index) => ({
      x: (ownerId === 'p1' ? 2 : 62) + index % 8,
      y: (ownerId === 'p1' ? 52 : 12) + Math.floor(index / 8),
    }));
    for (let index = cells.length - 1; index > 0; index--) {
      const other = Math.floor(roll() * (index + 1));
      [cells[index], cells[other]] = [cells[other]!, cells[index]!];
    }
    return cells.map((cell, index) => ({
      id: `${ownerId}-squad-${String(index).padStart(2, '0')}`, ownerId,
      kind: 'interceptor' as const, x: cell!.x, y: cell!.y,
      hp: 120, maxHp: 120, damage: 12, target: null, attackTargetId: null, route: [],
    }));
  });
  return stepBattlefieldWorld(world); // refresh the two fog masks for all 128 units
}

function command(player: PlayerId, seq: number, group: number) {
  const squadIds = Array.from({ length: 16 }, (_, index) =>
    `${player}-squad-${String(group * 16 + index).padStart(2, '0')}`);
  const variant = seq % 3;
  return { type: 'move_group' as const, seq, squadIds,
    x: player === 'p1' ? 30 + variant * 2 : 42 - variant * 2,
    y: player === 'p1' ? 46 + variant : 26 - variant };
}

function percentile(values: number[], fraction: number): number {
  const ordered = [...values].sort((a, b) => a - b);
  return ordered[Math.ceil(ordered.length * fraction) - 1]!;
}
function summary(values: number[]) {
  return { n: values.length, p50: +percentile(values, 0.5).toFixed(3),
    p95: +percentile(values, 0.95).toFixed(3), max: +Math.max(...values).toFixed(3) };
}
function next<T = any>(room: Room, type: string, accept: (value: T) => boolean = () => true): Promise<T> {
  return new Promise((resolve, reject) => {
    const off = room.onMessage(type, (value: T) => {
      if (!accept(value)) return;
      clearTimeout(timer); off(); resolve(value);
    });
    const timer = setTimeout(() => { off(); reject(new Error(`Timed out waiting for ${type}`)); }, 7_000);
  });
}

async function sendAndMeasure(room: Room, body: ReturnType<typeof command>): Promise<number> {
  const start = performance.now();
  const ack = next<{ seq: number }>(room, 'ack', (value) => value.seq === body.seq);
  room.send('command', envelope(body));
  await ack;
  return performance.now() - start;
}

async function networkCase(obstacles: boolean) {
  const server = createGameServer({ campaign: {
    countdownMs: 0, sectors: 1, reconnectWindowMs: 5_000,
    createSector: () => fixture(obstacles),
  } });
  await server.listen(PORT, '127.0.0.1');
  let a: Room | undefined;
  let b: Room | undefined;
  try {
    a = await new Client(URL).create('campaign', joins('Ana'));
    b = await new Client(URL).joinById(a.roomId, joins('Beto'));
    a.reconnection.enabled = false;
    b.reconnection.enabled = false;
    const offPhaseA = a.onMessage('phase', () => {});
    const offPhaseB = b.onMessage('phase', () => {});
    const offMapA = a.onMessage('map', () => {});
    const offMapB = b.onMessage('map', () => {});
    const firstA = next(a, 'view');
    const firstB = next(b, 'view');
    const stamps: Record<PlayerId, { at: number; tick: number }[]> = { p1: [], p2: [] };
    const offA = a.onMessage('view', (view: { tick: number }) =>
      stamps.p1.push({ at: performance.now(), tick: view.tick }));
    const offB = b.onMessage('view', (view: { tick: number }) =>
      stamps.p2.push({ at: performance.now(), tick: view.tick }));
    a.send('ready', envelope({})); b.send('ready', envelope({}));
    await Promise.all([firstA, firstB]);
    const roundtripMs: number[] = [];
    for (let burst = 0; burst < 4; burst++) {
      // Two sixteen-squad orders per client in one second = 32 actions/player/s.
      const seq = burst * 2 + 1;
      roundtripMs.push(...await Promise.all([
        sendAndMeasure(a, command('p1', seq, burst % 4)),
        sendAndMeasure(a, command('p1', seq + 1, (burst + 1) % 4)),
        sendAndMeasure(b, command('p2', seq, burst % 4)),
        sendAndMeasure(b, command('p2', seq + 1, (burst + 1) % 4)),
      ]));
      await new Promise((resolve) => setTimeout(resolve, 1_050));
    }
    offA(); offB(); offPhaseA(); offPhaseB(); offMapA(); offMapB();
    const intervals = (values: { at: number; tick: number }[]) =>
      values.slice(1).map(({ at }, index) => at - values[index]!.at);
    for (const player of ['p1', 'p2'] as const) {
      const gaps = stamps[player].slice(1).map(({ tick }, index) => tick - stamps[player][index]!.tick);
      expect(gaps.every((gap) => gap === 1)).toBe(true);
    }
    const p1 = intervals(stamps.p1);
    const p2 = intervals(stamps.p2);
    expect(p1.length).toBeGreaterThanOrEqual(25);
    expect(p2.length).toBeGreaterThanOrEqual(25);
    return { roundtripMs: summary(roundtripMs), viewIntervalMs: {
      p1: summary(p1), p2: summary(p2),
    } };
  } finally {
    if (a) await a.leave().catch(() => {});
    if (b) await b.leave().catch(() => {});
    await server.gracefullyShutdown(false);
  }
}

describe('128-squad map benchmark', () => {
  it('charges failed searches from both players against one room tick budget', () => {
    const walkable = BATTLEFIELD_MAP.walkable.map((value, index) => value && index % SIDE !== 35);
    const map = defineMapSpec({ ...BATTLEFIELD_MAP, id: 'benchmark-budget', walkable });
    const world = createBattlefieldWorld(map);
    world.squads = fixture(false).squads;
    world.guardians.forEach((guardian) => { guardian.hp = 0; });
    const campaign = campaigns.createCampaign({ countdownMs: 0, createSector: () => world });
    campaigns.join(campaign, 'Ana'); campaigns.join(campaign, 'Beto');
    campaigns.ready(campaign, 'p1', 1_000); campaigns.ready(campaign, 'p2', 1_000);
    campaigns.tick(campaign, 1_000);
    const room = new CampaignRoom();
    const probe = room as unknown as {
      campaign: campaigns.Campaign;
      remainingExpansions: number;
      runCommand: (player: PlayerId, body: unknown) => ReturnType<typeof campaigns.command>;
    };
    probe.campaign = campaign;
    let charged = 0;
    const charges: Record<PlayerId, number> = { p1: 0, p2: 0 };
    for (let order = 0; order < 40; order++) {
      const player: PlayerId = order % 2 === 0 ? 'p1' : 'p2';
      const body = command(player, 1, 0);
      body.x = player === 'p1' ? 50 : 20;
      body.y = 40;
      const before = probe.remainingExpansions;
      const result = probe.runCommand(player, body);
      expect(result.accepted).toBe(false);
      expect(result.expansions).toBeLessThanOrEqual(before);
      expect(probe.remainingExpansions).toBeGreaterThanOrEqual(0);
      charged += result.expansions;
      charges[player] += result.expansions;
      expect(charged + probe.remainingExpansions).toBe(SEARCH_BUDGET_PER_TICK);
      if (probe.remainingExpansions === 0) break;
    }
    expect(charges.p1).toBeGreaterThan(0);
    expect(charges.p2).toBeGreaterThan(0);
    expect(charged).toBeLessThanOrEqual(SEARCH_BUDGET_PER_TICK);
    expect(probe.remainingExpansions).toBe(0);
    expect(campaign.world?.players.p1.lastSequence).toBe(0);
    expect(campaign.world?.players.p2.lastSequence).toBe(0);
  });

  for (const [label, obstacles] of [['default-open', false], ['obstacle-load', true]] as const) {
    it(label, async () => {
      let world = fixture(obstacles);
      expect(world.squads).toHaveLength(128);
      expect(world.guardians.every((guardian) => guardian.hp === 0)).toBe(true);
      expect(world.core.open).toBe(false);
      const applyMs: number[] = [];
      const stepMs: number[] = [];
      const viewEncodeMs: number[] = [];
      const viewBytes: number[] = [];
      const expansionsPerTick: number[] = [];
      for (let sample = 0; sample < 40; sample++) {
        let remaining = SEARCH_BUDGET_PER_TICK;
        let used = 0;
        for (const player of ['p1', 'p2'] as const) for (let slot = 0; slot < 2; slot++) {
          const seq = sample * 2 + slot + 1;
          const body = command(player, seq, (sample * 2 + slot) % 4);
          const started = performance.now();
          const result = applyBattlefieldCommand(world, player, body, remaining);
          applyMs.push(performance.now() - started);
          expect(result.expansions).toBeGreaterThan(0); // real A* searches
          expect(result.expansions).toBeLessThanOrEqual(Math.min(16 * SIDE * SIDE, 32768, remaining));
          used += result.expansions;
          remaining -= result.expansions;
          expect(remaining).toBeGreaterThanOrEqual(0);
          expect(result.accepted).toBe(true);
          if (result.accepted) world = result.world;
        }
        expect(used).toBeLessThanOrEqual(SEARCH_BUDGET_PER_TICK);
        expansionsPerTick.push(used);
        const stepStart = performance.now();
        world = stepBattlefieldWorld(world);
        stepMs.push(performance.now() - stepStart);
        for (const player of ['p1', 'p2'] as const) {
          const viewStart = performance.now();
          const view = battlefieldViewFor(world, player);
          const frame = getMessageBytes.raw(Protocol.ROOM_DATA, 'view', view);
          viewEncodeMs.push(performance.now() - viewStart);
          viewBytes.push(frame.byteLength);
        }
      }
      const network = await networkCase(obstacles);
      const report = {
        case: label, seed: SEED, map: '72x72', squads: '64+64',
        actionsPerPlayerPerSecond: ACTIONS_PER_PLAYER_PER_BURST,
        idsPerOrder: 16, tickHz: 10, samples: 40,
        environment: { os: `${platform()} ${release()}`, cpu: cpus()[0]?.model,
          node: process.version },
        applyMs: summary(applyMs), stepMs: summary(stepMs),
        viewEncodeMs: summary(viewEncodeMs), viewWireBytes: summary(viewBytes),
        expansionsPerTick: summary(expansionsPerTick), network,
      };
      console.log(`MAP_BENCHMARK ${JSON.stringify(report)}`);
    }, 60_000);
  }
});
