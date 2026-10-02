import { describe, expect, it } from 'vitest';
import { advanceOccupancy, type OccupancySquad, type OccupancyWorld } from './occupancy.js';

const grid = { width: 5, height: 3, walkable: Array<boolean>(15).fill(true) };
const unit = (id: string, x: number, y: number, next?: [number, number], ownerId: 'p1' | 'p2' = 'p1'): OccupancySquad => ({
  id, ownerId, x, y, hp: 10, route: next ? [{ x: next[0], y: next[1] }] : [], target: next ? { x: next[0], y: next[1] } : null,
});
const state = (...squads: OccupancySquad[]): OccupancyWorld => ({ map: grid, squads, guardians: [] });

describe('simultaneous occupancy', () => {
  it('advances a diagonal step when both corner cells are open', () => {
    const world = state(unit('a', 0, 0, [1, 1]));
    expect(advanceOccupancy(world)).toBe(1);
    expect(world.squads[0]).toMatchObject({ x: 1, y: 1 });
  });

  it('rejects a diagonal step that cuts across a blocked corner', () => {
    const blocked = { width: 3, height: 3, walkable: Array<boolean>(9).fill(true) };
    blocked.walkable[1] = false;
    const world: OccupancyWorld = { map: blocked, squads: [unit('a', 0, 0, [1, 1])], guardians: [] };
    expect(advanceOccupancy(world)).toBe(0);
    expect(world.squads[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('enforces authored elevation transitions during movement', () => {
    const level = Array<number>(15).fill(0);
    const ramp = Array<null | 'x+'>(15).fill(null);
    level[1] = 1;
    const map = { width: 5, height: 3, walkable: Array<boolean>(15).fill(true), level, ramp };
    const blocked = state(unit('a', 0, 0, [1, 0]));
    blocked.map = map;
    expect(advanceOccupancy(blocked)).toBe(0);
    ramp[0] = 'x+';
    expect(advanceOccupancy(blocked)).toBe(1);
  });

  it('does not displace a settled ally across an unramped elevation boundary', () => {
    const level = [0, 0, 1, 1];
    const ramp = Array<null | 'x+'>(4).fill(null);
    const world = state(unit('a', 0, 0, [1, 0]), unit('b', 1, 0));
    world.squads[0]!.route.push({ x: 2, y: 0 });
    world.squads[0]!.target = { x: 2, y: 0 };
    world.map = { width: 4, height: 1, walkable: [true, true, true, true], level, ramp };
    expect(advanceOccupancy(world)).toBe(2);
    expect(world.squads.find(({ id }) => id === 'b')?.x).not.toBe(2);
  });

  it('advances ally chains into a freed cell independent of input array order', () => {
    const first = state(unit('z', 0, 1, [1, 1]), unit('a', 1, 1, [2, 1]));
    const second = state(unit('a', 1, 1, [2, 1]), unit('z', 0, 1, [1, 1]));
    expect(advanceOccupancy(first)).toBe(2);
    expect(advanceOccupancy(second)).toBe(2);
    expect(first.squads.map(({ id, x, y }) => ({ id, x, y })).sort((a, b) => a.id.localeCompare(b.id)))
      .toEqual(second.squads.map(({ id, x, y }) => ({ id, x, y })).sort((a, b) => a.id.localeCompare(b.id)));
    expect(new Set(first.squads.map((squad) => `${squad.x},${squad.y}`)).size).toBe(2);
  });

  it('allows ally swaps while denying enemy swaps and live guardian cells', () => {
    const allies = state(unit('a', 1, 1, [2, 1]), unit('b', 2, 1, [1, 1]));
    expect(advanceOccupancy(allies)).toBe(2);
    expect(allies.squads.map((squad) => squad.x)).toEqual([2, 1]);
    const enemies = state(unit('a', 1, 1, [2, 1]), unit('b', 2, 1, [1, 1], 'p2'));
    expect(advanceOccupancy(enemies)).toBe(0);
    const guardian = state(unit('a', 1, 1, [2, 1]));
    guardian.guardians.push({ id: 'g', x: 2, y: 1, hp: 1 });
    expect(advanceOccupancy(guardian)).toBe(0);
    guardian.guardians[0]!.hp = 0;
    expect(advanceOccupancy(guardian)).toBe(1);
  });

  it('uses ordinal ID for competing destinations and never overlaps live units', () => {
    const world = state(unit('z', 0, 1, [1, 1]), unit('a', 2, 1, [1, 1]));
    expect(advanceOccupancy(world)).toBe(1);
    expect(world.squads.find((squad) => squad.id === 'a')?.x).toBe(1);
    expect(world.squads.find((squad) => squad.id === 'z')?.x).toBe(0);
    expect(new Set(world.squads.map((squad) => `${squad.x},${squad.y}`)).size).toBe(2);
  });

  it('reserves a four-ally cycle ahead of an earlier-ID competing claimant', () => {
    const world = state(
      unit('z-a', 1, 0, [2, 0]), unit('z-b', 2, 0, [2, 1]),
      unit('z-c', 2, 1, [1, 1]), unit('z-d', 1, 1, [1, 0]),
      unit('a', 0, 0, [1, 0]),
    );
    expect(advanceOccupancy(world)).toBe(4);
    expect(world.squads.map(({ x, y }) => [x, y])).toEqual([[2, 0], [2, 1], [1, 1], [1, 0], [0, 0]]);
    expect(new Set(world.squads.map((squad) => `${squad.x},${squad.y}`)).size).toBe(5);
  });

  it('lets a settled ally yield a transit cell and return after passage', () => {
    const world = state(unit('a', 1, 1, [2, 1]), unit('b', 2, 1));
    world.squads[0]!.route.push({ x: 3, y: 1 });
    world.squads[0]!.target = { x: 3, y: 1 };
    expect(advanceOccupancy(world)).toBe(2);
    expect({ x: world.squads[0]!.x, y: world.squads[0]!.y }).toEqual({ x: 2, y: 1 });
    expect(new Set(world.squads.map((squad) => `${squad.x},${squad.y}`)).size).toBe(2);
    expect(world.squads[1]!.target).toEqual({ x: 2, y: 1 });
    expect(advanceOccupancy(world)).toBe(2);
    expect(world.squads.map((squad) => squad.x)).toEqual([3, 2]);
  });
});
