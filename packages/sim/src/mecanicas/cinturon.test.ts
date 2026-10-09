import { describe, expect, it } from 'vitest';
import { applyCommand, createSectorWorld, createSquad, stepWorld, TRAINING_MAPS, type World } from '../index.js';
import { beltSurface, createBelt, gateAt } from './cinturon.js';

const surface = { width: 5, height: 3, walkable: Array<boolean>(15).fill(true), level: Array<number>(15).fill(0), ramp: Array<null>(15).fill(null) };
const field = createBelt([{ id: 'paso', cells: [{ x: 2, y: 0 }, { x: 2, y: 1 }, { x: 2, y: 2 }], cycleSeconds: 6, openSeconds: 4, warningSeconds: 1 }], surface, 10)!;
const gate = field.gates[0]!;

const advance = (world: World, ticks: number): World => {
  let next = world;
  for (let tick = 0; tick < ticks; tick += 1) next = stepWorld(next);
  return next;
};

describe('asteroid belt', () => {
  it('stays clear, warns, closes and repeats', () => {
    expect(gateAt(gate, 0)).toEqual({ id: 'paso', phase: 'open', phaseEndsAt: 30 });
    expect(gateAt(gate, 30)).toEqual({ id: 'paso', phase: 'warning', phaseEndsAt: 40 });
    expect(gateAt(gate, 40)).toEqual({ id: 'paso', phase: 'closed', phaseEndsAt: 60 });
    expect(gateAt(gate, 60).phase).toBe('open');
    expect(beltSurface(field, 39).walkable[2]).toBe(true);
    expect(beltSurface(field, 40).walkable[2]).toBe(false);
    expect(beltSurface(field, 40)).toBe(field.closed);
    expect(beltSurface(field, 0)).toBe(beltSurface(field, 60));
  });

  it('reads the passages of Espiral Estelar closed and opens them in the match', () => {
    const sector = TRAINING_MAPS.espiral;
    const passage = sector.belt!.find((candidate) => candidate.cells.length > 4)!;
    const cell = passage.cells[Math.floor(passage.cells.length / 2)]!;
    const index = cell.y * sector.width + cell.x;
    expect(sector.walkable[index]).toBe(false);
    const world = createSectorWorld('espiral');
    expect(world.surface!.walkable[index]).toBe(true);
    const closedAt = passage.openSeconds * world.rules.tickRate;
    world.squads.push(createSquad('p1-caught', 'p1', 'interceptor', cell, world));
    const before = advance(world, closedAt - 1);
    expect(before.squads.find((unit) => unit.id === 'p1-caught')).toMatchObject(cell);
    // The belt closes: the ship inside is pushed to open ground without damage, and the cell is refused.
    const after = stepWorld(before);
    const caught = after.squads.find((unit) => unit.id === 'p1-caught')!;
    expect(after.surface!.walkable[index]).toBe(false);
    expect(after.surface!.walkable[caught.y * after.width + caught.x]).toBe(true);
    expect(caught.hp).toBe(caught.maxHp);
    expect(applyCommand(after, 'p1', { type: 'move', seq: 1, squadId: 'p1-caught', x: cell.x, y: cell.y })).toMatchObject({ accepted: false, reason: 'blocked_destination' });
    expect(advance(after, (passage.cycleSeconds - passage.openSeconds) * world.rules.tickRate).surface!.walkable[index]).toBe(true);
  });
});
