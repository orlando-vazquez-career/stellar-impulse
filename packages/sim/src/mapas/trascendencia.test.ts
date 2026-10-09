import { describe, expect, it } from 'vitest';
import { applyCommand, createSectorWorld, createSquad, stepWorld, type World } from '../index.js';
import { findPath } from '../maps/pathfinding.js';
import { TRASCENDENCIA } from './trascendencia.js';

const advance = (world: World, ticks: number): World => {
  let next = world;
  for (let tick = 0; tick < ticks; tick += 1) next = stepWorld(next);
  return next;
};
const steps = (world: World, from: { x: number; y: number }, to: { x: number; y: number }) => {
  const result = findPath(world.surface!, from, to);
  return result.status === 'found' ? result.path.length : Infinity;
};

describe('trascendencia estelar for two fleets', () => {
  it('is 115×115 with two bases, four pronexos, ten resources, two stations and eight barriers', () => {
    expect([TRASCENDENCIA.width, TRASCENDENCIA.height]).toEqual([115, 115]);
    expect(TRASCENDENCIA.captures).toHaveLength(4);
    expect(TRASCENDENCIA.metals).toHaveLength(10);
    expect(TRASCENDENCIA.stations).toHaveLength(2);
    expect(TRASCENDENCIA.stations!.every((station) => station.priceFactor === 3)).toBe(true);
    expect(TRASCENDENCIA.barriers!.map((barrier) => barrier.material).sort()).toEqual([...Array(4).fill('chatarra'), ...Array(4).fill('hielo')]);
    // Both fleets fly the same distances: the map is its own half-turn.
    const { bases, core, width } = TRASCENDENCIA;
    expect([bases.p1.x + bases.p2.x, bases.p1.y + bases.p2.y]).toEqual([width - 1, width - 1]);
    const world = createSectorWorld('trascendencia');
    expect(steps(world, bases.p1, core)).toBe(steps(world, bases.p2, core));
    for (const station of TRASCENDENCIA.stations!) expect(steps(world, bases.p1, station)).toBe(steps(world, bases.p2, station));
  });

  it('opens the ring road when a barrier is shot down', () => {
    let world = createSectorWorld('trascendencia');
    const base = world.players.p1.base;
    const barrier = world.guardians.filter((unit) => unit.role === 'barrier')
      .sort((a, b) => Math.hypot(a.x - base.x, a.y - base.y) - Math.hypot(b.x - base.x, b.y - base.y))[0]!;
    const pronexo = world.nodes.filter((node) => node.kind === 'capture' && !node.station)
      .sort((a, b) => Math.hypot(a.x - barrier.x, a.y - barrier.y) - Math.hypot(b.x - barrier.x, b.y - barrier.y))[0]!;
    const around = steps(world, base, pronexo);
    expect(world.surface!.walkable[barrier.y * world.width + barrier.x]).toBe(false);
    // A bomber parked beside it ignores the barrier until it is told to fire.
    const post = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]
      .map(([dx, dy]) => ({ x: barrier.x + dx! * 2, y: barrier.y + dy! * 2 }))
      .filter((cell) => world.surface!.walkable[cell.y * world.width + cell.x] && steps(world, base, cell) < Infinity)[0]!;
    world.squads.push(createSquad('p1-siege', 'p1', 'bomber', post, world));
    world = advance(world, 60);
    expect(world.guardians.find((unit) => unit.id === barrier.id)!.hp).toBe(barrier.maxHp);
    const ordered = applyCommand(world, 'p1', { type: 'attack', seq: 1, squadId: 'p1-siege', targetId: barrier.id });
    expect(ordered.accepted).toBe(true);
    world = advance(ordered.world, 900);
    expect(world.guardians.find((unit) => unit.id === barrier.id)!.hp).toBe(0);
    expect(world.surface!.walkable[barrier.y * world.width + barrier.x]).toBe(true);
    expect(steps(world, base, pronexo)).toBeLessThan(around * 0.7);
  });

  it('sells ships at once, at three times their price, to whoever holds a station', () => {
    const world = createSectorWorld('trascendencia');
    const station = world.nodes.find((node) => node.station)!;
    const buy = (state: World, seq = 1) => applyCommand(state, 'p1', { type: 'station_produce', seq, kind: 'frigate', stationId: station.id });
    expect(buy(world)).toMatchObject({ accepted: false, reason: 'not_owner' });
    station.ownerId = 'p1';
    world.players.p1.metal = 26;
    expect(buy(world)).toMatchObject({ accepted: false, reason: 'insufficient_metal' });
    world.players.p1.metal = 30;
    const bought = buy(world);
    expect(bought.accepted).toBe(true);
    expect(bought.world.players.p1.metal).toBe(3);
    const ship = bought.world.squads.at(-1)!;
    expect(ship).toMatchObject({ ownerId: 'p1', kind: 'frigate' });
    expect(Math.max(Math.abs(ship.x - station.x), Math.abs(ship.y - station.y))).toBeLessThanOrEqual(2);
    // The hangar queue is untouched: the base can still build.
    expect(bought.world.production.p1).toBeNull();
  });
});
