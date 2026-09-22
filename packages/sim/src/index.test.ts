import { describe, expect, it } from 'vitest';
import { applyCommand, createWorld, stepWorld, TRAINING_RULES, MVP_CANDIDATE_RULES, type World } from './index.js';

const move = (seq = 1, squadId = 'p1-interceptor', x = 3, y = 3) => ({ seq, type: 'move', squadId, x, y });
const ticks = (world: World, count: number): World => {
  for (let i = 0; i < count; i += 1) world = stepWorld(world);
  return world;
};
describe('authoritative command checks', () => {
  it('rejects duplicate and stale sequences without mutating the world', () => {
    const initial = createWorld();
    const result = applyCommand(initial, 'p1', move());
    expect(result.accepted).toBe(true);
    expect(initial.players.p1.lastSequence).toBe(0);
    expect(initial.squads[0]!.target).toBeNull();
    expect(applyCommand(result.world, 'p1', move())).toMatchObject({ accepted: false, reason: 'stale_sequence' });
    const latest = applyCommand(result.world, 'p1', move(3));
    expect(applyCommand(latest.world, 'p1', move(2))).toMatchObject({ accepted: false, reason: 'stale_sequence' });
  });
  it('enforces ownership, identity, bounds and alive squads', () => {
    const world = createWorld();
    expect(applyCommand(world, 'p1', move(1, 'p2-interceptor'))).toMatchObject({ accepted: false, reason: 'not_owner' });
    expect(applyCommand(world, 'outsider', move())).toMatchObject({ accepted: false, reason: 'unknown_player' });
    expect(applyCommand(world, 'p1', move(1, 'missing'))).toMatchObject({ accepted: false, reason: 'unknown_squad' });
    for (const [x, y] of [[12, 3], [-1, 3], [3, 12], [3, -1]]) {
      expect(applyCommand(world, 'p1', move(1, 'p1-interceptor', x, y))).toMatchObject({ accepted: false, reason: 'out_of_bounds' });
    }
    world.squads[0]!.hp = 0;
    expect(applyCommand(world, 'p1', move())).toMatchObject({ accepted: false, reason: 'squad_destroyed' });
  });
});
describe('deterministic integer simulation', () => {
  it('replays the same command stream to exactly the same serialized state', () => {
    const replay = (): World => {
      let world = createWorld();
      world = applyCommand(world, 'p1', move()).world;
      world = ticks(world, 120);
      world = applyCommand(world, 'p1', move(2, 'p1-interceptor', 6, 6)).world;
      return ticks(world, 240);
    };
    expect(JSON.stringify(replay())).toBe(JSON.stringify(replay()));
    expect(replay().winner).toBe('p1');
    expect(replay().players.p1.metal).toBeGreaterThan(0);
  });
  it('moves one orthogonal cell only at the configured tick and keeps prior snapshots', () => {
    const world = applyCommand(createWorld(), 'p1', move()).world;
    expect(ticks(world, 2).squads[0]).toMatchObject({ x: 1, y: 10 });
    expect(ticks(world, 3).squads[0]).toMatchObject({ x: 2, y: 10 });
    expect(world.tick).toBe(0);
    expect(world.squads[0]).toMatchObject({ x: 1, y: 10 });
  });
  it('applies lethal attacks simultaneously, independently of array order', () => {
    const world = createWorld();
    world.tick = 9;
    Object.assign(world.squads[0]!, { x: 0, y: 0, hp: 12 });
    Object.assign(world.squads[1]!, { x: 1, y: 0, hp: 12 });
    const result = stepWorld(world);
    expect(result.squads.map((unit) => unit.hp)).toEqual([0, 0]);
    world.squads.reverse();
    expect(stepWorld(world).squads.map((unit) => unit.hp)).toEqual([0, 0]);
  });
  it('keeps training time distinct from proposed MVP timing', () => {
    expect(TRAINING_RULES.tickRate).toBe(10);
    expect(TRAINING_RULES.coreOpenTick).toBe(200);
    expect(MVP_CANDIDATE_RULES.coreOpenTick).toBe(1800);
    expect(MVP_CANDIDATE_RULES.coreCaptureTicks).toBe(400);
  });
});
describe('guarded capture', () => {
  it('cannot capture a resource before its guardian dies; then generates metal', () => {
    let world = createWorld();
    Object.assign(world.squads[0]!, { x: 3, y: 3 });
    world = ticks(world, 29);
    expect(world.guardians[0]!.hp).toBe(12);
    expect(world.nodes[0]!.progress.p1).toBe(0);
    world = stepWorld(world);
    expect(world.guardians[0]!.hp).toBe(0);
    expect(world.nodes[0]!.progress.p1).toBe(1);
    world = ticks(world, 30);
    expect(world.nodes[0]!.ownerId).toBe('p1');
    expect(world.players.p1.metal).toBe(1);
  });
  it('protects the core and its guardian before opening', () => {
    const initial = createWorld();
    Object.assign(initial.squads[0]!, { x: 6, y: 6 });
    const closed = ticks(initial, 199);
    expect(closed.core.open).toBe(false);
    expect(closed.core.progress.p1).toBe(0);
    expect(closed.guardians[1]!.hp).toBe(60);
    const opened = stepWorld(closed);
    expect(opened.core.open).toBe(true);
    expect(opened.guardians[1]!.hp).toBe(48);
    expect(opened.core.progress.p1).toBe(0);
  });
  it('freezes disputed capture, decays absent progress and closes exactly once', () => {
    let world = createWorld();
    world.tick = 200;
    world.guardians[1]!.hp = 0;
    Object.assign(world.squads[0]!, { x: 6, y: 5 });
    Object.assign(world.squads[1]!, { x: 6, y: 7 });
    world.core.progress = { p1: 10, p2: 8 };
    world = ticks(world, 5);
    expect(world.core.progress).toEqual({ p1: 10, p2: 8 });
    Object.assign(world.squads[1]!, { x: 11, y: 0 });
    world = ticks(world, 5);
    expect(world.core.progress).toEqual({ p1: 15, p2: 3 });
    world = ticks(world, 65);
    expect(world.winner).toBe('p1');
    expect(stepWorld(world)).toBe(world);
    expect(applyCommand(world, 'p1', move())).toMatchObject({ accepted: false, reason: 'match_finished' });
  });
});
