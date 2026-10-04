import { describe, expect, it } from 'vitest';
import {
  applyCommand, BASE_RULES, createMatchWorld, createSquad, effectiveFleetCap, metalIncomeRate, runTrainingRival,
  stepWorld, visionSources, type PlayerId, type Position, type World,
} from './index.js';

const run = (world: World, ticks: number) => { for (let i = 0; i < ticks; i++) world = stepWorld(world); return world; };
let seq = 0;
const order = (world: World, player: PlayerId, command: Record<string, unknown>) =>
  applyCommand(world, player, { seq: ++seq, ...command });

/** A started complete match on Sector 01 with no guardians, augment picks or starting ships. */
function match(mode: 'complete' | 'skirmish' = 'complete'): World {
  const world = createMatchWorld('sector-01', mode, 7);
  world.augmentMatch!.started = true;
  for (const player of ['p1', 'p2'] as const) { world.augmentMatch!.players[player].offer = null; world.augmentMatch!.players[player].nextChoice = 3; }
  world.guardians = [];
  world.squads = [];
  world.matchRecord = undefined;
  seq = 0;
  return world;
}
function openNeighbour(world: World, cell: Position): Position {
  for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]] as const) {
    const next = { x: cell.x + dx, y: cell.y + dy };
    if (world.surface!.walkable[next.y * world.width + next.x]) return next;
  }
  throw new Error('no open neighbour');
}

describe('base economy', () => {
  it('starts both sides with 10 Metal, a shielded base and empty module slots', () => {
    const world = match();
    for (const player of ['p1', 'p2'] as const) {
      expect(world.players[player].metal).toBe(10);
      expect(world.players[player].structure).toMatchObject({ hp: 2500, maxHp: 2500 });
      expect(world.players[player].modules).toEqual({ refinery: 0, extras: [], building: null });
    }
    expect(match('skirmish').players.p1.structure!.maxHp).toBe(1500);
    expect(BASE_RULES.skirmish.modules.refinery).toEqual({ cost: 21, buildTicks: 210 });
  });

  it('pays the first-capture bonus once and keeps a node idle while it stabilizes', () => {
    let world = match();
    const node = world.nodes.find((candidate) => candidate.kind === 'metal')!;
    world.squads.push(createSquad('raider', 'p1', 'interceptor', node, world));
    world = run(world, world.rules.nodeCaptureTicks);
    const captured = world.nodes.find((candidate) => candidate.id === node.id)!;
    expect(captured.ownerId).toBe('p1');
    expect(captured).toMatchObject({ claimed: true, activeAt: world.tick + 200 });
    const { baseIncome, nodeRates } = BASE_RULES.complete;
    expect(world.players.p1.metal).toBeCloseTo(10 + 10 + baseIncome * 3);
    expect(metalIncomeRate(world, 'p1')).toBeCloseTo(baseIncome);
    world = run(world, 200);
    expect(metalIncomeRate(world, 'p1')).toBeCloseTo(baseIncome + nodeRates[0]);
    // A recapture restarts the wait but pays nothing.
    world.nodes.find((candidate) => candidate.id === node.id)!.ownerId = 'p2';
    const before = world.players.p1.metal;
    world = run(world, world.rules.nodeCaptureTicks);
    expect(world.players.p1.metal - before).toBeCloseTo(baseIncome * 3);
  });

  it('raises node output with the Refinery and Refinery II', () => {
    const world = match();
    const node = world.nodes.find((candidate) => candidate.kind === 'metal')!;
    node.ownerId = 'p1';
    const { baseIncome, nodeRates } = BASE_RULES.complete;
    for (const level of [0, 1, 2] as const) {
      world.players.p1.modules!.refinery = level;
      expect(metalIncomeRate(world, 'p1')).toBeCloseTo(baseIncome + nodeRates[level]);
    }
    expect(nodeRates[1]).toBeGreaterThan(nodeRates[0]);
    expect(nodeRates[2]).toBeGreaterThan(nodeRates[1]);
  });
});

describe('base modules', () => {
  it('requires the Refinery first, builds one module at a time and leaves one extra out', () => {
    let world = match();
    world.players.p1.metal = 500;
    expect(order(world, 'p1', { type: 'build_module', module: 'shipyard' })).toMatchObject({ accepted: false, reason: 'module_locked' });
    expect(order(world, 'p1', { type: 'build_module', module: 'refinery2' })).toMatchObject({ accepted: false, reason: 'module_locked' });
    world = order(world, 'p1', { type: 'build_module', module: 'refinery' }).world;
    expect(world.players.p1.metal).toBe(470);
    expect(order(world, 'p1', { type: 'build_module', module: 'radar' })).toMatchObject({ accepted: false, reason: 'module_busy' });
    world = run(world, 299);
    expect(world.players.p1.modules!.refinery).toBe(0);
    world = run(world, 1);
    expect(world.players.p1.modules!.refinery).toBe(1);
    expect(order(world, 'p1', { type: 'build_module', module: 'refinery' })).toMatchObject({ accepted: false, reason: 'module_built' });
    world = run(order(world, 'p1', { type: 'build_module', module: 'shipyard' }).world, 350);
    world = run(order(world, 'p1', { type: 'build_module', module: 'radar' }).world, 300);
    expect(world.players.p1.modules!.extras).toEqual(['shipyard', 'radar']);
    expect(order(world, 'p1', { type: 'build_module', module: 'bastion' })).toMatchObject({ accepted: false, reason: 'module_slots_full' });
    world = run(order(world, 'p1', { type: 'build_module', module: 'refinery2' }).world, 400);
    expect(world.players.p1.modules!.refinery).toBe(2);
  });

  it('refuses a module the player cannot pay for', () => {
    const world = match();
    world.players.p1.metal = 29;
    expect(order(world, 'p1', { type: 'build_module', module: 'refinery' })).toMatchObject({ accepted: false, reason: 'insufficient_metal' });
  });

  it('applies the Shipyard, Bastion and Radar effects', () => {
    const world = match();
    world.players.p1.modules = { refinery: 1, extras: ['shipyard', 'radar'], building: null };
    world.players.p2.modules = { refinery: 1, extras: ['bastion'], building: null };
    world.players.p1.metal = 50;
    const built = order(world, 'p1', { type: 'produce', kind: 'frigate' }).world;
    expect(built.production.p1!.readyTick).toBe(Math.round(60 * 0.65));
    expect(effectiveFleetCap(world, 'p1')).toBe(14);
    expect(visionSources(world, 'p1')[0]!.radius).toBe(world.rules.visionRadius + 4);
    // Bastion completion adds 600 hull; its guns are checked in the defense test below.
    let bastion = match();
    bastion.players.p2.metal = 500;
    bastion.players.p2.modules!.refinery = 1;
    bastion = run(order(bastion, 'p2', { type: 'build_module', module: 'bastion' }).world, 350);
    expect(bastion.players.p2.structure).toMatchObject({ hp: 3100, maxHp: 3100 });
  });
});

describe('destructible bases', () => {
  it('stays shielded until minute 5, then takes damage and falls', () => {
    let world = match();
    const base = world.players.p2.base;
    const raider = createSquad('raider', 'p1', 'bomber', openNeighbour(world, base), world);
    raider.hp = raider.maxHp = 100000;
    world.squads.push(raider);
    expect(order(world, 'p1', { type: 'attack', squadId: 'raider', targetId: 'p2-base' })).toMatchObject({ accepted: false, reason: 'target_unavailable' });
    world = run(world, 100);
    expect(world.players.p2.structure!.hp).toBe(2500);
    world.tick = BASE_RULES.complete.vulnerableTick;
    world = order(world, 'p1', { type: 'attack', squadId: 'raider', targetId: 'p2-base' }).world;
    world = run(world, 31);
    // A Bombardier hits structures at x1.5 minus the base's 2 armour: 36 * 1.5 - 2 = 52.
    expect(world.players.p2.structure!.hp).toBe(2500 - 52 * 2);
    world.players.p2.structure!.hp = 10;
    world = run(world, 40);
    expect(world.players.p2.structure!.hp).toBe(0);
    expect(world.winner).toBe('p1');
  });

  it('shoots intruders from the start, harder with the Bastion', () => {
    let world = match();
    const base = world.players.p2.base;
    world.squads.push(createSquad('scout', 'p1', 'frigate', openNeighbour(world, base), world));
    world = run(world, 10);
    expect(world.squads[0]!.hp).toBe(220 - (12 - 3));
    let fortified = match();
    fortified.players.p2.modules = { refinery: 1, extras: ['bastion'], building: null };
    fortified.squads.push(createSquad('scout', 'p1', 'frigate', openNeighbour(fortified, base), fortified));
    fortified = run(fortified, 10);
    expect(fortified.squads[0]!.hp).toBe(220 - (20 - 3));
  });

  it('repairs itself after ten quiet seconds', () => {
    let world = match();
    world.players.p1.structure!.hp = 1000;
    world.players.p1.structure!.lastDamageTick = 0;
    world = run(world, 100);
    expect(world.players.p1.structure!.hp).toBe(1003);
  });

  it('lets a player surrender only once bases are exposed', () => {
    const world = match();
    expect(order(world, 'p1', { type: 'surrender' })).toMatchObject({ accepted: false, reason: 'surrender_locked' });
    world.tick = BASE_RULES.complete.vulnerableTick;
    expect(order(world, 'p1', { type: 'surrender' }).world.winner).toBe('p2');
  });
});

describe('rival base building', () => {
  it('builds its Refinery once it holds a node and can pay', () => {
    const world = match();
    world.nodes.find((node) => node.kind === 'metal')!.ownerId = 'p2';
    world.players.p2.metal = 40;
    const turn = runTrainingRival(world, new Map(), 'medium');
    expect(turn.world.players.p2.modules!.building).toMatchObject({ kind: 'refinery' });
    // The 10 Metal left over goes to the hangar as usual.
    const ship = turn.world.production.p2;
    expect(turn.world.players.p2.metal).toBe(10 - (ship ? { explorer: 4, interceptor: 6, frigate: 9, bomber: 12 }[ship.kind] : 0));
  });
});
