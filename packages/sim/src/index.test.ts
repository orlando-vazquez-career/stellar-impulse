import { describe, expect, it } from 'vitest';
import { applyCommand, createSquad, createWorld, findPath, stepWorld, TRAINING_RULES, MVP_CANDIDATE_RULES, UNIT_STATS, type World } from './index.js';

const move = (seq = 1, squadId = 'p1-interceptor', x = 4, y = 4) => ({ seq, type: 'move', squadId, x, y });
const attack = (targetId: string, seq = 1, squadId = 'p1-interceptor') => ({ seq, type: 'attack', squadId, targetId });
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
    for (const [x, y] of [[20, 3], [-1, 3], [3, 20], [3, -1]]) {
      expect(applyCommand(world, 'p1', move(1, 'p1-interceptor', x, y))).toMatchObject({ accepted: false, reason: 'out_of_bounds' });
    }
    world.squads[0]!.hp = 0;
    expect(applyCommand(world, 'p1', move())).toMatchObject({ accepted: false, reason: 'squad_destroyed' });
  });
  it('rejects impassable and unreachable destinations without consuming a sequence', () => {
    const world = createWorld();
    expect(applyCommand(world, 'p1', move(1, 'p1-interceptor', 4, 14))).toMatchObject({ accepted: false, reason: 'blocked_destination' });
    const isolated = createWorld();
    for (let x = 1; x <= 3; x++) for (let y = 16; y <= 18; y++) if (x !== 2 || y !== 17) isolated.obstacles.push({ x, y });
    expect(applyCommand(isolated, 'p1', move())).toMatchObject({ accepted: false, reason: 'unreachable_destination' });
    expect(isolated.players.p1.lastSequence).toBe(0);
  });
  it('validates attack ownership, visibility, target state and class', () => {
    const world = createWorld();
    expect(applyCommand(world, 'p1', attack('p2-interceptor'))).toMatchObject({ accepted: false, reason: 'target_not_visible' });
    expect(applyCommand(world, 'p1', attack('p1-interceptor'))).toMatchObject({ accepted: false, reason: 'friendly_target' });
    expect(applyCommand(world, 'p1', attack('missing'))).toMatchObject({ accepted: false, reason: 'unknown_target' });
    Object.assign(world.squads[1]!, { x: 3, y: 17 });
    expect(applyCommand(world, 'p1', attack('p2-interceptor')).accepted).toBe(true);
    world.squads[1]!.hp = 0;
    expect(applyCommand(world, 'p1', attack('p2-interceptor'))).toMatchObject({ accepted: false, reason: 'target_destroyed' });
    world.squads[0] = createSquad('scout', 'p1', 'explorer', { x: 2, y: 17 });
    expect(applyCommand(world, 'p1', attack('p2-interceptor', 1, 'scout'))).toMatchObject({ accepted: false, reason: 'cannot_attack' });
    expect(world.players.p1.lastSequence).toBe(0);
  });
});
describe('deterministic integer simulation', () => {
  it('keeps both bases reachable on a larger symmetric obstacle map', () => {
    const world = createWorld();
    expect([world.width, world.height]).toEqual([20, 20]);
    expect(world.players.p1.base).toEqual({ x: world.players.p2.base.y, y: world.players.p2.base.x });
    expect(world.obstacles.length).toBeGreaterThan(20);
    const ids = new Set(world.obstacles.map(({ x, y }) => `${x},${y}`));
    expect(ids.size).toBe(world.obstacles.length);
    for (const { x, y } of world.obstacles) {
      expect(ids.has(`${y},${x}`)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(world.width);
      expect(y).toBeLessThan(world.height);
    }
    for (const player of Object.values(world.players)) {
      expect(ids.has(`${player.base.x},${player.base.y}`)).toBe(false);
      expect(findPath(player.base, world.core, world.width, world.height, world.obstacles).length).toBeGreaterThan(2);
    }
    expect(ids.has(`${world.core.x},${world.core.y}`)).toBe(false);
  });
  it('keeps both bases reachable on a larger symmetric obstacle map', () => {
    const world = createWorld();
    expect([world.width, world.height]).toEqual([20, 20]);
    expect(world.players.p1.base).toEqual({ x: world.players.p2.base.y, y: world.players.p2.base.x });
    expect(world.obstacles.length).toBeGreaterThan(20);
    const ids = new Set(world.obstacles.map(({ x, y }) => `${x},${y}`));
    expect(ids.size).toBe(world.obstacles.length);
    for (const { x, y } of world.obstacles) {
      expect(ids.has(`${y},${x}`)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(world.width);
      expect(y).toBeLessThan(world.height);
    }
    for (const player of Object.values(world.players)) {
      expect(ids.has(`${player.base.x},${player.base.y}`)).toBe(false);
      expect(findPath(player.base, world.core, world.width, world.height, world.obstacles).length).toBeGreaterThan(2);
    }
    expect(ids.has(`${world.core.x},${world.core.y}`)).toBe(false);
  });
  it('replays the same command stream to exactly the same serialized state', () => {
    const replay = (): World => {
      let world = createWorld();
      world = applyCommand(world, 'p1', move()).world;
      world = ticks(world, 120);
      world = applyCommand(world, 'p1', move(2, 'p1-interceptor', 10, 10)).world;
      return ticks(world, 240);
    };
    expect(JSON.stringify(replay())).toBe(JSON.stringify(replay()));
    expect(replay().winner).toBe('p1');
    expect(replay().players.p1.metal).toBeGreaterThan(0);
  });
  it('moves on the configured tick using eight-way routing and keeps prior snapshots', () => {
    const world = applyCommand(createWorld(), 'p1', move()).world;
    expect(ticks(world, 2).squads[0]).toMatchObject({ x: 2, y: 17 });
    expect(ticks(world, 3).squads[0]).toMatchObject(findPath({ x: 2, y: 17 }, { x: 4, y: 4 }, world.width, world.height, world.obstacles)[1]!);
    expect(world.tick).toBe(0);
    expect(world.squads[0]).toMatchObject({ x: 2, y: 17 });
  });
  it('routes around fixed terrain without treating ships as obstacles', () => {
    const obstacles = [{ x: 2, y: 1 }];
    const route = findPath({ x: 1, y: 1 }, { x: 3, y: 1 }, 5, 5, obstacles);
    expect(route[0]).toEqual({ x: 1, y: 1 });
    expect(route.at(-1)).toEqual({ x: 3, y: 1 });
    expect(route).not.toContainEqual(obstacles[0]);
    expect(route.length).toBeGreaterThan(3);
    const world = createWorld();
    Object.assign(world.squads[1]!, { x: 2, y: 16 });
    expect(applyCommand(world, 'p1', move(1, 'p1-interceptor', 2, 16)).accepted).toBe(true);
  });
  it('chases a designated enemy around rocks and applies damage in range', () => {
    const world = createWorld();
    Object.assign(world.squads[0]!, { x: 3, y: 14 });
    Object.assign(world.squads[1]!, { x: 6, y: 14 });
    const ordered = applyCommand(world, 'p1', attack('p2-interceptor'));
    expect(ordered.accepted).toBe(true);
    expect(ordered.world.squads[0]!.attackTargetId).toBe('p2-interceptor');
    expect(world.squads[0]!.attackTargetId).toBeNull();
    const first = ticks(ordered.world, 3);
    expect(first.obstacles).not.toContainEqual({ x: first.squads[0]!.x, y: first.squads[0]!.y });
    const fought = ticks(first, 30);
    expect(fought.squads[1]!.hp).toBeLessThan(fought.squads[1]!.maxHp);
    const redirected = applyCommand(fought, 'p1', move(2, 'p1-interceptor', 2, 17));
    expect(redirected.world.squads[0]!.attackTargetId).toBeNull();
  });
  it('derives health and damage from unit type and applies distinct speeds', () => {
    const world = createWorld();
    const frigate = createSquad('frigate', 'p1', 'frigate', { x: 2, y: 17 });
    const bomber = createSquad('bomber', 'p1', 'bomber', { x: 2, y: 17 });
    expect([frigate.maxHp, frigate.damage]).toEqual([UNIT_STATS.frigate.maxHp, UNIT_STATS.frigate.damage]);
    expect([bomber.maxHp, bomber.damage]).toEqual([UNIT_STATS.bomber.maxHp, UNIT_STATS.bomber.damage]);
    world.squads.push(frigate, bomber);
    for (const unit of world.squads.filter((unit) => unit.ownerId === 'p1')) unit.target = { x: 2, y: 15 };
    const moved = ticks(world, 3);
    expect(moved.squads[0]).toMatchObject({ x: 2, y: 16 });
    expect(moved.squads[2]).toMatchObject({ x: 2, y: 17 });
    expect(moved.squads[3]).toMatchObject({ x: 2, y: 17 });
    const later = ticks(moved, 3);
    expect(later.squads[2]).toMatchObject({ x: 2, y: 16 });
    expect(later.squads[3]).toMatchObject({ x: 2, y: 16 });
  });
  it('applies class advantage and keeps explorers noncombatant', () => {
    const world = createWorld();
    world.tick = 9;
    Object.assign(world.squads[0]!, { x: 1, y: 10 });
    world.squads[1] = createSquad('p2-bomber', 'p2', 'bomber', { x: 2, y: 10 });
    const fought = stepWorld(world);
    expect(fought.squads[1]!.hp).toBe(UNIT_STATS.bomber.maxHp - 15);
    const explorerWorld = createWorld();
    explorerWorld.squads[0] = createSquad('scout', 'p1', 'explorer', { x: 4, y: 4 });
    explorerWorld.guardians[0]!.hp = 0;
    const explored = ticks(explorerWorld, 30);
    expect(explored.nodes[0]!.progress.p1).toBe(0);
    expect(explored.squads[0]!.damage).toBe(0);
  });
  it('prioritizes an explicit attack target over the default ID tie-break', () => {
    const world = createWorld();
    world.tick = 9;
    Object.assign(world.squads[0]!, { x: 2, y: 10 });
    world.squads[1] = createSquad('a-enemy', 'p2', 'interceptor', { x: 1, y: 10 });
    world.squads.push(createSquad('z-enemy', 'p2', 'interceptor', { x: 3, y: 10 }));
    const ordered = applyCommand(world, 'p1', {
      seq: 1, type: 'attack', squadId: 'p1-interceptor', targetId: 'z-enemy',
    });
    expect(ordered.accepted).toBe(true);
    const fought = stepWorld(ordered.world);
    expect(fought.squads.find((unit) => unit.id === 'a-enemy')!.hp).toBe(120);
    expect(fought.squads.find((unit) => unit.id === 'z-enemy')!.hp).toBe(108);
  });
  it('does not let an enemy explorer contest resource capture', () => {
    const world = createWorld();
    world.guardians[0]!.hp = 0;
    Object.assign(world.squads[0]!, { x: 4, y: 4 });
    world.squads[1] = createSquad('scout', 'p2', 'explorer', { x: 4, y: 5 });
    const captured = stepWorld(world);
    expect(captured.nodes[0]!.progress).toEqual({ p1: 1, p2: 0 });
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
    Object.assign(world.squads[0]!, { x: 4, y: 4 });
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
    Object.assign(initial.squads[0]!, { x: 10, y: 10 });
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
    Object.assign(world.squads[0]!, { x: 10, y: 9 });
    Object.assign(world.squads[1]!, { x: 10, y: 11 });
    world.core.progress = { p1: 10, p2: 8 };
    world = ticks(world, 5);
    expect(world.core.progress).toEqual({ p1: 10, p2: 8 });
    Object.assign(world.squads[1]!, { x: 19, y: 0 });
    world = ticks(world, 5);
    expect(world.core.progress).toEqual({ p1: 15, p2: 3 });
    world = ticks(world, 65);
    expect(world.winner).toBe('p1');
    expect(stepWorld(world)).toBe(world);
    expect(applyCommand(world, 'p1', move())).toMatchObject({ accepted: false, reason: 'match_finished' });
  });
});
