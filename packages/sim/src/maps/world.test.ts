import { describe, expect, it } from 'vitest';
import { createBattlefieldWorld, applyBattlefieldCommand, stepBattlefieldWorld, cloneBattlefieldWorld } from '../index.js';
import { defineMapSpec, type MapSpec } from './types.js';

const map = (walkable = Array<boolean>(12 * 12).fill(true)): MapSpec => defineMapSpec({
  id: 'test-field', version: 1, width: 12, height: 12, cellSize: 72,
  bases: { p1: { x: 1, y: 10 }, p2: { x: 10, y: 1 } },
  objectives: [
    { id: 'metal-1', kind: 'metal', cell: { x: 3, y: 3 }, guardianId: 'metal-guardian', guardianCell: { x: 3, y: 3 } },
    { id: 'core', kind: 'core', cell: { x: 6, y: 6 }, guardianId: 'core-guardian', guardianCell: { x: 6, y: 6 } },
  ],
  walkable, opaque: Array<boolean>(12 * 12).fill(false),
});
const move = (seq: number, squadIds: string[], x: number, y: number) => ({ type: 'move_group', seq, squadIds, x, y });
const attack = (seq: number, squadIds: string[], targetId: string) => ({ type: 'attack_group', seq, squadIds, targetId });

describe('battlefield world', () => {
  it('creates a separate 72-cell-ready schema with one squad each and copied fog', () => {
    const world = createBattlefieldWorld(map());
    expect(world).toMatchObject({ schemaVersion: 2, mode: 'battlefield', width: 12, height: 12, tick: 0 });
    expect(world.squads.map((unit) => unit.ownerId)).toEqual(['p1', 'p2']);
    expect(world.visible.p1[10 * 12 + 1]).toBe(true);
    expect(world.explored.p1).toEqual(world.visible.p1);
    expect(world.explored.p1).not.toBe(world.visible.p1);
    const clone = cloneBattlefieldWorld(world);
    expect(clone.map).toBe(world.map);
    expect(clone.squads[0]).not.toBe(world.squads[0]);
    expect(clone.visible.p1).not.toBe(world.visible.p1);
    expect(clone.explored.p1).not.toBe(world.explored.p1);
    expect(createBattlefieldWorld(map(), { coreOpenTick: 0 }).core.open).toBe(true);
    const valid = map();
    const duplicate = defineMapSpec({ ...valid, objectives: valid.objectives.map((objective) =>
      objective.kind === 'core' ? { ...objective, guardianId: 'p1-interceptor' } : objective) });
    expect(() => createBattlefieldWorld(duplicate)).toThrow('Map entity ID collides with roster');
  });

  it('unifies unavailable IDs and rejects a group atomically under a measured budget', () => {
    const world = createBattlefieldWorld(map());
    const reasons = [
      move(1, ['missing'], 4, 10),
      move(1, ['p2-interceptor'], 4, 10),
    ].map((command) => applyBattlefieldCommand(world, 'p1', command));
    world.squads[0]!.hp = 0;
    reasons.push(applyBattlefieldCommand(world, 'p1', move(1, ['p1-interceptor'], 4, 10)));
    expect(reasons.map((result) => result.accepted ? null : result.reason)).toEqual(['unit_unavailable', 'unit_unavailable', 'unit_unavailable']);
    expect(reasons.every((result) => result.world === world && result.expansions === 0)).toBe(true);
    world.squads[0]!.hp = 120;
    world.squads.push({ ...world.squads[0]!, id: 'p1-a', x: 2, y: 10, target: null, route: [] });
    world.squads.push({ ...world.squads[0]!, id: 'p1-z', x: 3, y: 10, target: null, route: [] });
    const snapshot = JSON.stringify(world);
    const denied = applyBattlefieldCommand(world, 'p1', move(1, ['p1-z', 'p1-a'], 4, 10), 3);
    expect(denied).toMatchObject({ accepted: false, reason: 'budget_exceeded', world, expansions: 3 });
    expect(JSON.stringify(world)).toBe(snapshot);
    expect(world.players.p1.lastSequence).toBe(0);
  });

  it('assigns distinct nearby static destinations by ID and stops without a search', () => {
    const world = createBattlefieldWorld(map());
    world.squads.push({ ...world.squads[0]!, id: 'p1-extra', x: 2, y: 10, target: null, route: [] });
    const a = applyBattlefieldCommand(world, 'p1', move(1, ['p1-interceptor', 'p1-extra'], 7, 10));
    const b = applyBattlefieldCommand(world, 'p1', move(1, ['p1-extra', 'p1-interceptor'], 7, 10));
    expect(a.accepted && b.accepted).toBe(true);
    expect(a.expansions).toBe(b.expansions);
    expect(a.world.squads.map((unit) => unit.target)).toEqual(b.world.squads.map((unit) => unit.target));
    const targets = a.world.squads.filter((unit) => unit.ownerId === 'p1').map((unit) => JSON.stringify(unit.target));
    expect(new Set(targets).size).toBe(2);
    const stopped = applyBattlefieldCommand(a.world, 'p1', { type: 'stop', seq: 2, squadIds: ['p1-interceptor', 'p1-extra'] });
    expect(stopped).toMatchObject({ accepted: true, expansions: 0 });
    expect(stopped.world.squads.filter((unit) => unit.ownerId === 'p1').every((unit) => unit.route.length === 0 && unit.target === null)).toBe(true);
  });

  it('accepts a visible attack group and keeps target resolution authoritative', () => {
    let world = createBattlefieldWorld(map(), { moveEveryTicks: 1, attackEveryTicks: 1 });
    world.squads[0]!.x = 1; world.squads[0]!.y = 10;
    world.squads[1]!.x = 5; world.squads[1]!.y = 10;
    world.visible.p1.fill(true);
    const accepted = applyBattlefieldCommand(world, 'p1', attack(1, ['p1-interceptor'], 'p2-interceptor'));
    expect(accepted).toMatchObject({ accepted: true });
    expect(accepted.world.squads[0]).toMatchObject({ attackTargetId: 'p2-interceptor', target: { x: 5, y: 10 } });
    expect(accepted.world.squads[0]!.route.length).toBeGreaterThan(0);
    const fought = stepBattlefieldWorld(accepted.world);
    expect(fought.squads[0]!.attackTargetId).toBe('p2-interceptor');
  });

  it('cancels an attack when a replacement move or stop order is accepted', () => {
    let world = createBattlefieldWorld(map(), { moveEveryTicks: 1, attackEveryTicks: 1 });
    world.squads[0]!.x = 1; world.squads[0]!.y = 10;
    world.squads[1]!.x = 2; world.squads[1]!.y = 10;
    world.visible.p1.fill(true);
    const attackResult = applyBattlefieldCommand(world, 'p1', attack(1, ['p1-interceptor'], 'p2-interceptor'));
    expect(attackResult.accepted).toBe(true);
    const stopped = applyBattlefieldCommand(attackResult.world, 'p1', { type: 'stop', seq: 2, squadIds: ['p1-interceptor'] });
    expect(stopped).toMatchObject({ accepted: true });
    expect(stopped.world.squads[0]).toMatchObject({ attackTargetId: null, stance: 'guard' });
    const afterStop = stepBattlefieldWorld(stopped.world);
    expect(afterStop.squads[1]!.hp).toBe(120);
    const moved = applyBattlefieldCommand(attackResult.world, 'p1', move(2, ['p1-interceptor'], 1, 9));
    expect(moved).toMatchObject({ accepted: true });
    expect(moved.world.squads[0]).toMatchObject({ attackTargetId: null, stance: 'march' });
  });

  it('rejects an attack against the locked core guardian', () => {
    const world = createBattlefieldWorld(map(), { coreOpenTick: 100 });
    world.squads[0]!.x = 5; world.squads[0]!.y = 6;
    world.visible.p1.fill(true);
    const result = applyBattlefieldCommand(world, 'p1', attack(1, ['p1-interceptor'], 'core-guardian'));
    expect(result).toMatchObject({ accepted: false, reason: 'target_unavailable' });
  });

  it('uses only static terrain for ack and route, independent of a hidden enemy', () => {
    const base = createBattlefieldWorld(map());
    const hidden = cloneBattlefieldWorld(base);
    hidden.squads.push({ ...hidden.squads[1]!, id: 'p2-hidden', x: 9, y: 10, target: null, route: [] });
    const command = move(1, ['p1-interceptor'], 8, 10);
    const a = applyBattlefieldCommand(base, 'p1', command);
    const b = applyBattlefieldCommand(hidden, 'p1', command);
    expect(a.accepted).toBe(true);
    expect(b.accepted).toBe(true);
    expect(a.expansions).toBe(b.expansions);
    expect(a.world.squads[0]!.route).toEqual(b.world.squads[0]!.route);
    expect(a.world.visible.p1).toEqual(b.world.visible.p1);
    const first = stepBattlefieldWorld(stepBattlefieldWorld(stepBattlefieldWorld(a.world)));
    const second = stepBattlefieldWorld(stepBattlefieldWorld(stepBattlefieldWorld(b.world)));
    expect(first.squads[0]!.x).toBe(second.squads[0]!.x);
    expect(first.visible.p1).toEqual(second.visible.p1);
  });

  it('accumulates exploration on ticks without a view call and replays identically', () => {
    const play = () => {
      let world = createBattlefieldWorld(map());
      const result = applyBattlefieldCommand(world, 'p1', move(1, ['p1-interceptor'], 11, 10));
      world = result.world;
      const priorExplored = world.explored.p1;
      for (let tick = 0; tick < 30; tick += 1) world = stepBattlefieldWorld(world);
      expect(priorExplored[10 * 12 + 6]).toBe(false);
      expect(world.explored.p1[10 * 12 + 6]).toBe(true);
      expect(world.visible.p1[10 * 12 + 6]).toBe(false);
      return world;
    };
    expect(JSON.stringify(play())).toBe(JSON.stringify(play()));
  });

  it('keeps simultaneous fatal combat, capture and metal income', () => {
    let world = createBattlefieldWorld(map(), { attackEveryTicks: 1, moveEveryTicks: 100, tickRate: 1, nodeCaptureTicks: 2 });
    world.squads[0]!.x = 2; world.squads[0]!.y = 3; world.squads[0]!.hp = 2;
    world.squads[0]!.stance = 'attack';
    world.squads[0]!.attackTargetId = 'metal-guardian';
    world.guardians.find((unit) => unit.id === 'metal-guardian')!.hp = 12;
    const fought = stepBattlefieldWorld(world);
    expect(fought.squads[0]!.hp).toBe(0);
    expect(fought.guardians.find((unit) => unit.id === 'metal-guardian')!.hp).toBe(0);
    expect(world.squads[0]!.hp).toBe(2);
    world = createBattlefieldWorld(map(), { attackEveryTicks: 100, moveEveryTicks: 100, tickRate: 1, nodeCaptureTicks: 2 });
    world.squads[0]!.x = 2; world.squads[0]!.y = 3;
    world.guardians.find((unit) => unit.id === 'metal-guardian')!.hp = 0;
    world = stepBattlefieldWorld(stepBattlefieldWorld(world));
    expect(world.nodes[0]!.ownerId).toBe('p1');
    expect(world.players.p1.metal).toBeGreaterThan(0);
  });

  it('supports a 128-squad fixture without live-cell overlap', () => {
    const world = createBattlefieldWorld();
    const occupied = new Set([...world.squads, ...world.guardians].map((unit) => `${unit.x},${unit.y}`));
    for (let y = 0; y < world.height && world.squads.length < 128; y += 1) {
      for (let x = 0; x < world.width && world.squads.length < 128; x += 1) {
        const cell = `${x},${y}`;
        if (occupied.has(cell)) continue;
        occupied.add(cell);
        world.squads.push({ ...world.squads[0]!, id: `p1-extra-${world.squads.length}`, x, y, target: null, route: [] });
      }
    }
    expect(world.squads).toHaveLength(128);
    const next = stepBattlefieldWorld(world);
    expect(next.squads).toHaveLength(128);
    expect(new Set(next.squads.map((unit) => `${unit.x},${unit.y}`)).size).toBe(128);
    expect(world.visible.p1).not.toBe(next.visible.p1);
  });

  it('lets a 16-squad formation settle on an open map without permanent ally blockage', () => {
    let world = createBattlefieldWorld(undefined, { moveEveryTicks: 1, coreOpenTick: 10000 });
    for (const guardian of world.guardians) guardian.hp = 0;
    const ids = [world.squads[0]!.id];
    for (let y = 61; y <= 64; y += 1) {
      for (let x = 6; x <= 9; x += 1) {
        if (x === 8 && y === 63) continue;
        const id = `p1-extra-${ids.length}`;
        world.squads.push({ ...world.squads[0]!, id, x, y, target: null, route: [] });
        ids.push(id);
      }
    }
    expect(ids).toHaveLength(16);
    const accepted = applyBattlefieldCommand(world, 'p1', move(1, ids.reverse(), 36, 36));
    expect(accepted.accepted).toBe(true);
    expect(accepted.expansions).toBeLessThanOrEqual(32768);
    world = accepted.world;
    for (let tick = 0; tick < 600; tick += 1) world = stepBattlefieldWorld(world);
    expect(world.winner).toBeNull();
    expect(world.squads.filter((squad) => squad.ownerId === 'p1' && squad.route.length > 0)).toEqual([]);
    expect(new Set(world.squads.filter((squad) => squad.hp > 0).map((squad) => `${squad.x},${squad.y}`)).size)
      .toBe(world.squads.filter((squad) => squad.hp > 0).length);
  });

  it('passes an ally settled on the shortest route in the two-squad case', () => {
    let world = createBattlefieldWorld(undefined, { moveEveryTicks: 1, coreOpenTick: 10000 });
    for (const guardian of world.guardians) guardian.hp = 0;
    world.squads[0]!.x = 35; world.squads[0]!.y = 36;
    world.squads.push({ ...world.squads[0]!, id: 'p1-z', x: 36, y: 37, target: null, route: [] });
    const accepted = applyBattlefieldCommand(world, 'p1', move(1, ['p1-z', 'p1-interceptor'], 36, 36));
    expect(accepted.accepted).toBe(true);
    world = accepted.world;
    for (let tick = 0; tick < 12; tick += 1) world = stepBattlefieldWorld(world);
    expect(world.squads.filter((squad) => squad.ownerId === 'p1').map((squad) => ({ id: squad.id, route: squad.route, target: squad.target })))
      .toEqual([
        { id: 'p1-interceptor', route: [], target: null },
        { id: 'p1-z', route: [], target: null },
      ]);
  });
});
