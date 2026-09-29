import { describe, expect, it } from 'vitest';
import { applyBattlefieldCommand, createBattlefieldWorld, stepBattlefieldWorld } from '@impulso/sim';
import {
  battlefieldViewFor, decodeBattlefieldMask, encodeBattlefieldMask,
  type BattlefieldOwnSquad,
} from './index.js';

const at = (x: number, y: number, width = 72): number => y * width + x;

describe('battlefield private view', () => {
  it('publishes only own economy and sequence, with public bases and core', () => {
    const world = createBattlefieldWorld();
    world.players.p1.metal = 7;
    world.players.p1.lastSequence = 4;
    world.players.p2.metal = 999;
    world.players.p2.lastSequence = 321;
    Object.assign(world.players.p2, { privatePlan: 'hidden-player' });
    Object.assign(world.core, { privatePlan: 'hidden-core' });
    const view = battlefieldViewFor(world, 'p1');
    expect(view).toMatchObject({ schemaVersion: 2, mode: 'battlefield', mapId: 'battlefield', mapVersion: 1,
      width: 72, height: 72, playerId: 'p1' });
    expect(view.players.p1).toEqual({ id: 'p1', base: { x: 8, y: 63 }, metal: 7, lastSequence: 4 });
    expect(view.players.p2).toEqual({ id: 'p2', base: { x: 63, y: 8 } });
    expect(view.core).toEqual({ id: 'core', guardianId: 'core-guardian', x: 36, y: 36,
      open: false, progress: { p1: 0, p2: 0 } });
    expect(Object.keys(view).sort()).toEqual([
      'core', 'explored', 'guardians', 'height', 'mapId', 'mapVersion', 'mode', 'nodes', 'playerId',
      'players', 'rules', 'schemaVersion', 'squads', 'tick', 'visible', 'width', 'winner',
    ].sort());
    expect(JSON.stringify(view)).not.toContain('hidden-');
    expect(JSON.stringify(view)).not.toContain('objectives');
    expect(JSON.stringify(view)).not.toContain('walkable');
  });

  it('omits hidden rivals and shows visible rivals without route, target or injected fields', () => {
    const world = createBattlefieldWorld();
    const rival = world.squads.find((unit) => unit.ownerId === 'p2')!;
    rival.route = [{ x: 50, y: 50 }];
    rival.target = { x: 50, y: 50 };
    Object.assign(rival, { secret: 'rival-secret' });
    expect(battlefieldViewFor(world, 'p1').squads.map((unit) => unit.id)).toEqual(['p1-interceptor']);
    world.visible.p1[at(rival.x, rival.y)] = true;
    const view = battlefieldViewFor(world, 'p1');
    expect(view.squads).toHaveLength(2);
    expect(view.squads[1]).toEqual({
      id: 'p2-interceptor', ownerId: 'p2', kind: 'interceptor', x: 63, y: 8,
      hp: 120, maxHp: 120, damage: 12,
    });
    expect(JSON.stringify(view)).not.toContain('rival-secret');
    rival.hp = 0;
    expect(battlefieldViewFor(world, 'p1').squads).toHaveLength(1);
  });

  it('copies own route and all nested public values without aliasing World', () => {
    const world = createBattlefieldWorld();
    const own = world.squads[0]!;
    own.route = [{ x: 9, y: 63 }, { x: 10, y: 63 }];
    own.target = { x: 10, y: 63 };
    Object.assign(own, { privatePlan: 'unit-secret' });
    const view = battlefieldViewFor(world, 'p1');
    const visibleOwn = view.squads[0] as BattlefieldOwnSquad;
    expect(visibleOwn.route).toEqual(own.route);
    expect(visibleOwn.target).toEqual(own.target);
    Object.assign(visibleOwn.route[0]!, { x: 999 });
    Object.assign(visibleOwn.target!, { x: 999 });
    Object.assign(view.players.p1.base, { x: 999 });
    view.rules.visionRadius = 99;
    view.core.progress.p1 = 99;
    view.visible.data[0] = 255;
    expect(own.route[0]!.x).toBe(9);
    expect(own.target!.x).toBe(10);
    expect(world.players.p1.base.x).toBe(8);
    expect(world.rules.visionRadius).toBe(4);
    expect(world.core.progress.p1).toBe(0);
    expect(world.visible.p1[0]).toBe(false);
    expect(JSON.stringify(battlefieldViewFor(world, 'p1'))).not.toContain('unit-secret');
  });

  it('uses the World visibility mask for guardians and nodes, without calculating new fog', () => {
    const world = createBattlefieldWorld();
    expect(battlefieldViewFor(world, 'p1').guardians).toEqual([]);
    expect(battlefieldViewFor(world, 'p1').nodes).toEqual([]);
    const guardian = world.guardians[0]!;
    const node = world.nodes[0]!;
    Object.assign(guardian, { secret: 'guardian-secret' });
    Object.assign(node, { secret: 'node-secret' });
    world.visible.p1[at(guardian.x, guardian.y)] = true;
    world.visible.p1[at(node.x, node.y)] = true;
    const view = battlefieldViewFor(world, 'p1');
    expect(view.guardians[0]).toEqual({
      id: guardian.id, objectiveId: guardian.objectiveId, x: guardian.x, y: guardian.y,
      hp: guardian.hp, maxHp: guardian.maxHp, damage: guardian.damage,
    });
    expect(view.nodes[0]).toEqual({
      id: node.id, kind: node.kind, guardianId: node.guardianId, x: node.x, y: node.y,
      ownerId: node.ownerId, progress: { p1: 0, p2: 0 },
    });
    expect(JSON.stringify(view)).not.toContain('guardian-secret');
    expect(JSON.stringify(view)).not.toContain('node-secret');
  });

  it('encodes row-major LSB0 bytes and decodes edge cells independently', () => {
    const cells = Array<boolean>(9).fill(false);
    for (const index of [0, 7, 8]) cells[index] = true;
    const mask = encodeBattlefieldMask(cells, 3, 3);
    expect(mask).toEqual({ encoding: 'bitset-lsb0', width: 3, height: 3, data: [129, 1] });
    const independent = Array.from({ length: 9 }, (_, index) =>
      (mask.data[Math.floor(index / 8)]! & (2 ** (index % 8))) !== 0);
    expect(independent).toEqual(cells);
    expect(decodeBattlefieldMask(mask)).toEqual(cells);
    mask.data[1] = 0;
    expect(cells[8]).toBe(true);
    expect(() => decodeBattlefieldMask({ ...mask, data: [1] })).toThrow();
    expect(() => decodeBattlefieldMask({ ...mask, data: [129, 128] })).toThrow();
    expect(() => decodeBattlefieldMask({ ...mask, data: [129, ,] as number[] })).toThrow();
    expect(() => encodeBattlefieldMask([true, , false, false] as boolean[], 2, 2)).toThrow();
    expect(() => encodeBattlefieldMask([true, false, 1] as unknown as boolean[], 3, 1)).toThrow();
    expect(() => encodeBattlefieldMask([], 129, 1)).toThrow();
    expect(() => decodeBattlefieldMask({ encoding: 'bitset-lsb0', width: 129, height: 1, data: [] })).toThrow();
    expect(encodeBattlefieldMask(Array<boolean>(128 * 128).fill(false), 128, 128).data).toHaveLength(2048);
  });

  it('projects accumulated exploration across ticks and repeated reconnect snapshots', () => {
    let world = createBattlefieldWorld(undefined, { visionRadius: 1, moveEveryTicks: 1 });
    const initialExplored = [...world.explored.p1];
    const accepted = applyBattlefieldCommand(world, 'p1', {
      type: 'move_group', seq: 1, squadIds: ['p1-interceptor'], x: 12, y: 63,
    });
    expect(accepted.accepted).toBe(true);
    world = accepted.world;
    for (let tick = 0; tick < 4; tick++) world = stepBattlefieldWorld(world);
    expect(world.visible.p1[at(10, 63)]).toBe(false);
    expect(world.explored.p1[at(10, 63)]).toBe(true);
    const before = JSON.stringify(world);
    const first = battlefieldViewFor(world, 'p1');
    const reconnected = battlefieldViewFor(world, 'p1');
    expect(reconnected).toEqual(first);
    expect(decodeBattlefieldMask(first.explored)[at(10, 63)]).toBe(true);
    expect(decodeBattlefieldMask(first.visible)[at(10, 63)]).toBe(false);
    for (let index = 0; index < initialExplored.length; index++) {
      if (initialExplored[index]) expect(world.explored.p1[index]).toBe(true);
    }
    expect(JSON.stringify(world)).toBe(before);
    expect(first.players.p1.lastSequence).toBe(1);
  });
});
