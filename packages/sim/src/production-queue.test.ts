import { describe, expect, it } from 'vitest';
import {
  applyCommand, createMatchWorld, createSquad, effectiveFleetCap, grantAugment, MAX_PRODUCTION_QUEUE, runTrainingRival,
  statsFor, stepWorld, type AiMemory, type TrainingMapId, type UnitKind, type World,
} from './index.js';

type Kind = UnitKind;
/**
 * A running match without income, guardians, nodes to capture or augment offers, so every Metal change is the
 * hangar's: an unguarded Metal node beside the base would otherwise pay whoever launches next to it.
 */
function hangar(map: TrainingMapId = 'sector-01'): World {
  const world = createMatchWorld(map, 'skirmish', 3);
  world.augmentMatch!.started = true;
  for (const player of ['p1', 'p2'] as const) {
    world.augmentMatch!.players[player].offer = null;
    world.augmentMatch!.players[player].nextChoice = 3;
  }
  world.baseRules = { ...world.baseRules!, baseIncome: 0 };
  world.guardians = [];
  world.nodes = world.nodes.filter((node) => node.station);
  world.players.p1.metal = 200;
  return world;
}
const build = (world: World, kind: Kind) => statsFor(world, 'p1', kind).buildTicks;
const cost = (world: World, kind: Kind) => statsFor(world, 'p1', kind).cost;
/** Orders the kinds in turn, from seq `from` on; every one must be accepted. */
function order(world: World, kinds: Kind[], from = 1): World {
  return kinds.reduce((current, kind, index) => {
    const result = applyCommand(current, 'p1', { seq: from + index, type: 'produce', kind });
    expect(result, `${kind} #${index}`).toMatchObject({ accepted: true });
    return result.world;
  }, world);
}
const cancel = (world: World, seq: number, slot: number, kind: Kind) =>
  applyCommand(world, 'p1', { seq, type: 'cancel_production', slot, kind });
const until = (world: World, tick: number) => { let next = world; while (next.tick < tick) next = stepWorld(next); return next; };
const run = (world: World, ticks: number) => until(world, world.tick + ticks);
const queue = (world: World) => world.productionQueue?.p1 ?? [];
const alive = (world: World) => world.squads.filter((unit) => unit.ownerId === 'p1' && unit.hp > 0 && !unit.isDecoy).length;
/** Explorers parked in a row so the hangar sees the fleet it needs. */
function fill(world: World, count: number): void {
  for (let index = 0; index < count; index += 1) world.squads.push(createSquad(`p1-filler-${index}`, 'p1', 'explorer', { x: 10 + index % 8, y: 14 + Math.floor(index / 8) }, world));
}

describe('hangar queue', () => {
  it('queues a paid order behind a busy hangar and leaves the ship in production alone', () => {
    const first = order(hangar(), ['frigate']);
    const active = first.production.p1;
    const queued = applyCommand(first, 'p1', { seq: 2, type: 'produce', kind: 'interceptor' });
    expect(queued.accepted).toBe(true);
    expect(queued.world.players.p1.metal).toBe(200 - cost(first, 'frigate') - cost(first, 'interceptor'));
    expect(queued.world.production.p1).toEqual(active);
    expect(queue(queued.world)).toEqual([{ kind: 'interceptor', paid: cost(first, 'interceptor') }]);
    expect(queue(first)).toEqual([]);
  });

  it('holds five orders and refuses the sixth without touching the world', () => {
    const full = order(hangar(), ['explorer', 'explorer', 'explorer', 'explorer', 'explorer']);
    expect(MAX_PRODUCTION_QUEUE).toBe(5);
    expect(queue(full)).toHaveLength(4);
    const sixth = applyCommand(full, 'p1', { seq: 6, type: 'produce', kind: 'explorer' });
    expect(sixth).toMatchObject({ accepted: false, reason: 'production_queue_full' });
    expect(sixth.world).toBe(full);
    expect(full.players.p1.lastSequence).toBe(5);
  });

  it('counts the ship in production and every queued one against the fleet cap', () => {
    const world = hangar();
    fill(world, effectiveFleetCap(world, 'p1') - 2 - alive(world));
    expect(alive(world)).toBe(effectiveFleetCap(world, 'p1') - 2);
    const two = order(world, ['explorer', 'explorer']);
    expect(applyCommand(two, 'p1', { seq: 3, type: 'produce', kind: 'explorer' })).toMatchObject({ accepted: false, reason: 'fleet_full' });
  });

  it('refuses a station purchase once the hangar orders fill the fleet', () => {
    const world = hangar('trascendencia');
    const station = world.nodes.find((node) => node.station)!;
    station.ownerId = 'p1';
    fill(world, effectiveFleetCap(world, 'p1') - 2 - alive(world));
    const buy = (state: World, seq: number) => applyCommand(state, 'p1', { seq, type: 'station_produce', kind: 'explorer', stationId: station.id });
    expect(buy(world, 1).accepted).toBe(true);
    const ordered = order(world, ['explorer', 'explorer'], 1);
    expect(buy(ordered, 3)).toMatchObject({ accepted: false, reason: 'fleet_full' });
  });

  it('starts the next order on the tick the previous ship launches, first in first out', () => {
    let world = order(hangar(), ['explorer', 'interceptor', 'frigate']);
    const start = world.tick;
    expect(world.production.p1).toMatchObject({ kind: 'explorer', readyTick: start + build(world, 'explorer') });
    world = until(world, start + build(world, 'explorer'));
    expect(world.squads.map((unit) => unit.id)).toContain('p1-explorer-1');
    expect(world.production.p1).toMatchObject({ kind: 'interceptor', readyTick: world.tick + build(world, 'interceptor') });
    expect(queue(world)).toEqual([{ kind: 'frigate', paid: cost(world, 'frigate') }]);
    world = until(world, world.production.p1!.readyTick);
    expect(world.production.p1).toMatchObject({ kind: 'frigate', readyTick: world.tick + build(world, 'frigate') });
    world = until(world, world.production.p1!.readyTick);
    expect(world.squads.filter((unit) => /^p1-\w+-\d+$/.test(unit.id)).map((unit) => unit.id))
      .toEqual(['p1-explorer-1', 'p1-interceptor-2', 'p1-frigate-3']);
    expect(world.production.p1).toBeNull();
    expect(queue(world)).toEqual([]);
  });

  it('builds the rest of the queue faster once a Shipyard is up, and spends fast builds as each order starts', () => {
    let world = hangar();
    grantAugment(world, 'p1', 's-hangar');
    world = order(world, ['frigate', 'frigate', 'frigate']);
    expect(world.augmentMatch!.players.p1.fastBuilds).toBe(1);
    const first = world.production.p1!;
    world.players.p1.modules = { refinery: 1, extras: ['shipyard'], building: null };
    world = until(world, first.readyTick);
    // The second order starts now, with the last fast build and the Shipyard.
    expect(world.augmentMatch!.players.p1.fastBuilds).toBe(0);
    expect(world.production.p1!.readyTick).toBe(world.tick + Math.max(1, Math.round(build(world, 'frigate') * 0.5 * 0.65)));
    world = until(world, world.production.p1!.readyTick);
    expect(world.production.p1!.readyTick).toBe(world.tick + Math.round(build(world, 'frigate') * 0.65));
  });

  it('refunds exactly what a cancelled order paid, even after its price changed', () => {
    const world = order(hangar(), ['explorer', 'frigate']);
    const paid = cost(world, 'frigate');
    grantAugment(world, 'p1', 'p-expansion');
    expect(cost(world, 'frigate')).not.toBe(paid);
    const before = world.players.p1.metal;
    const cancelled = cancel(world, 3, 1, 'frigate');
    expect(cancelled.accepted).toBe(true);
    expect(cancelled.world.players.p1.metal).toBe(before + paid);
    expect(queue(cancelled.world)).toEqual([]);
    expect(cancelled.world.production.p1).toEqual(world.production.p1);
    expect(cancelled.world.players.p1.lastSequence).toBe(3);
  });

  it('cancels the ship in production with a refund and starts the next one on the following tick', () => {
    const world = order(hangar(), ['frigate', 'explorer']);
    const cancelled = cancel(world, 3, 0, 'frigate');
    expect(cancelled.accepted).toBe(true);
    expect(cancelled.world.players.p1.metal).toBe(world.players.p1.metal + cost(world, 'frigate'));
    expect(cancelled.world.production.p1).toBeNull();
    const next = stepWorld(cancelled.world);
    expect(next.production.p1).toMatchObject({ kind: 'explorer', readyTick: next.tick + build(next, 'explorer') });
    expect(queue(next)).toEqual([]);
  });

  it('refuses a cancel for an empty or impossible slot, a mismatched kind or an old sequence', () => {
    const world = order(hangar(), ['frigate', 'explorer']);
    for (const [slot, kind] of [[2, 'explorer'], [4, 'explorer'], [5, 'explorer'], [1, 'frigate'], [0, 'explorer']] as const) {
      const refused = cancel(world, 3, slot, kind);
      expect(refused, `${slot} ${kind}`).toMatchObject({ accepted: false, reason: 'invalid_command' });
      expect(refused.world).toBe(world);
    }
    expect(cancel(world, 2, 1, 'explorer')).toMatchObject({ accepted: false, reason: 'stale_sequence', world });
    expect(world.players.p1.lastSequence).toBe(2);
  });

  it('drops a queued kind an augment now forbids, refunds it and moves on to the next order', () => {
    let world = order(hangar(), ['frigate', 'interceptor', 'explorer']);
    grantAugment(world, 'p1', 'p-mercenarios');
    const before = world.players.p1.metal;
    world = until(world, world.production.p1!.readyTick);
    expect(world.players.p1.metal).toBe(before + cost(world, 'interceptor'));
    expect(world.production.p1).toMatchObject({ kind: 'explorer', readyTick: world.tick + build(world, 'explorer') });
    expect(queue(world)).toEqual([]);
  });

  it('keeps the next order waiting, paid and unbuilt, while the fleet is at its cap', () => {
    let world = order(hangar(), ['frigate', 'frigate']);
    grantAugment(world, 'p1', 'p-mercenarios');
    fill(world, effectiveFleetCap(world, 'p1') - 1 - alive(world));
    const metal = world.players.p1.metal;
    world = until(world, world.production.p1!.readyTick);
    expect(alive(world)).toBe(effectiveFleetCap(world, 'p1'));
    world = run(world, 200);
    expect(world.production.p1).toBeNull();
    expect(queue(world)).toEqual([{ kind: 'frigate', paid: cost(world, 'frigate') }]);
    expect(world.players.p1.metal).toBe(metal);
    expect(world.squads.filter((unit) => unit.id.startsWith('p1-frigate-'))).toHaveLength(1);
    // A ship lost frees a berth: the order starts on the next tick.
    world.squads.find((unit) => unit.id === 'p1-filler-0')!.hp = 0;
    world = stepWorld(world);
    expect(world.production.p1).toMatchObject({ kind: 'frigate', readyTick: world.tick + build(world, 'frigate') });
  });

  it('holds the finished ship and the whole queue while the hangar is blocked, and never launches one twice', () => {
    let world = order(hangar(), ['explorer', 'explorer']);
    const base = world.players.p1.base;
    const open = world.surface!;
    world.surface = { ...open, walkable: open.walkable.map((walkable, index) => {
      const x = index % world.width, y = Math.floor(index / world.width);
      const ring = Math.max(Math.abs(x - base.x), Math.abs(y - base.y));
      return walkable && (ring === 0 || ring > 4);
    }) };
    world = run(world, 200);
    expect(world.production.p1).toMatchObject({ kind: 'explorer' });
    expect(queue(world)).toHaveLength(1);
    expect(world.built.p1).toBe(0);
    world.surface = open;
    world = stepWorld(world);
    expect(world.built.p1).toBe(1);
    expect(world.production.p1).toMatchObject({ kind: 'explorer', readyTick: world.tick + build(world, 'explorer') });
    world = run(world, 100);
    const ids = world.squads.filter((unit) => unit.id.startsWith('p1-explorer-')).map((unit) => unit.id);
    expect(ids).toEqual(['p1-explorer-1', 'p1-explorer-2']);
    expect(world.built.p1).toBe(2);
  });

  it('never queues for the rival AI', () => {
    let world = hangar('espiral');
    world.players.p2.metal = 300;
    let memories: ReadonlyMap<string, AiMemory> = new Map();
    for (let tick = 0; tick < 600; tick += 1) {
      if (tick % world.rules.tickRate === 0) {
        const turn = runTrainingRival(world, memories, 'hard');
        memories = turn.memories;
        world = turn.world;
      }
      world = stepWorld(world);
      expect(world.productionQueue?.p2 ?? []).toEqual([]);
    }
    expect(world.built.p2).toBeGreaterThan(0);
  });

  it('reaches the same state from the same orders', () => {
    const play = () => {
      let world = order(hangar(), ['explorer', 'frigate', 'interceptor', 'bomber']);
      world = run(world, 50);
      world = cancel(world, 5, 1, 'interceptor').world;
      return run(order(world, ['explorer'], 6), 150);
    };
    expect(play()).toEqual(play());
  });
});
