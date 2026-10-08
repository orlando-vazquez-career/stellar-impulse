import { describe, expect, it } from 'vitest';
import { parseCommand } from '@impulso/input';
import { applyCommand, createSectorWorld, createSquad, createWorld, stepWorld, type Squad, type UnitKind, type World } from '../index.js';
import { FORMATIONS, formationCells, formationShape, marchHeading, planFormation, type FormationKind } from './formations.js';

const open = { open: () => true };
const key = (cell: { x: number; y: number }) => `${cell.x},${cell.y}`;

/** Open 40×40 field with a block of ships in the south-west corner. */
function field(kinds: UnitKind[] = Array(8).fill('interceptor')): World {
  const world = createWorld();
  world.width = 40; world.height = 40;
  world.obstacles = []; world.guardians = []; world.nodes = [];
  world.surface = { width: 40, height: 40, walkable: Array(1600).fill(true), level: Array(1600).fill(0), ramp: Array(1600).fill(null) };
  world.squads = kinds.map((kind, index) => createSquad(`s${index}`, 'p1', kind, { x: 4 + (index % 4), y: 32 + Math.floor(index / 4) }));
  return world;
}

function march(world: World, formation: FormationKind, x: number, y: number, ticks = 400) {
  const ids = world.squads.map((squad) => squad.id);
  const result = applyCommand(world, 'p1', { seq: 1, type: 'move_formation', squadIds: ids, x, y, formation });
  expect(result.accepted).toBe(true);
  let current = result.world;
  const seats = new Map(current.squads.map((squad) => [squad.id, { ...squad.target! }]));
  let backwards = 0;
  for (let tick = 0; tick < ticks; tick++) {
    const before = new Map(current.squads.map((squad) => [squad.id, { x: squad.x, y: squad.y }]));
    current = stepWorld(current);
    for (const squad of current.squads) {
      const seat = seats.get(squad.id)!;
      const from = before.get(squad.id)!;
      const gap = (cell: { x: number; y: number }) => Math.max(Math.abs(cell.x - seat.x), Math.abs(cell.y - seat.y));
      if (gap(squad) > gap(from)) backwards++;
    }
    const cells = current.squads.map(key);
    expect(new Set(cells).size).toBe(cells.length);
  }
  return { world: current, seats, backwards };
}

describe('formation shapes', () => {
  it.each(FORMATIONS)('%s gives every ship its own cell', (kind) => {
    for (const count of [2, 3, 5, 8, 12, 24, 26, 40]) {
      const cells = formationCells(kind, count, { x: 20, y: 20 }, { x: 0, y: -1 });
      expect(cells).toHaveLength(count);
      expect(new Set(cells.map(key)).size).toBe(count);
    }
  });

  it('a line stands across the march and a column along it', () => {
    const north = { x: 0, y: -1 };
    const line = formationCells('line', 5, { x: 10, y: 10 }, north);
    expect(new Set(line.map((cell) => cell.y))).toEqual(new Set([10]));
    const column = formationCells('column', 5, { x: 10, y: 10 }, north);
    expect(new Set(column.map((cell) => cell.x))).toEqual(new Set([10]));
    // Heading east turns the line upright.
    const east = formationCells('line', 5, { x: 10, y: 10 }, { x: 1, y: 0 });
    expect(new Set(east.map((cell) => cell.x))).toEqual(new Set([10]));
  });

  it('the wedge leader is at the point and each row is wider', () => {
    const shape = formationShape('wedge', 6);
    expect(shape[0]!.side).toBe(0);
    const rows = new Map<number, number>();
    for (const seat of shape) rows.set(seat.depth, (rows.get(seat.depth) ?? 0) + 1);
    expect([...rows.entries()].sort((a, b) => b[0] - a[0]).map(([, size]) => size)).toEqual([1, 2, 3]);
    // The point faces the march.
    const cells = formationCells('wedge', 6, { x: 10, y: 10 }, { x: 0, y: -1 });
    expect(cells[0]!.y).toBe(Math.min(...cells.map((cell) => cell.y)));
  });

  it('ranks split a big group into parallel lines with a gap between them', () => {
    const shape = formationShape('ranks', 10);
    const depths = [...new Set(shape.map((seat) => seat.depth))].sort((a, b) => a - b);
    expect(depths).toHaveLength(2);
    expect(depths[1]! - depths[0]!).toBe(2);
  });

  it('snaps the march to eight directions', () => {
    expect(marchHeading({ x: 0, y: 0 }, { x: 10, y: 1 })).toEqual({ x: 1, y: 0 });
    expect(marchHeading({ x: 0, y: 0 }, { x: 5, y: -5 })).toEqual({ x: 1, y: -1 });
    expect(marchHeading({ x: 3, y: 3 }, { x: 3, y: 3 }, { x: -1, y: 0 })).toEqual({ x: -1, y: 0 });
  });
});

describe('seat assignment', () => {
  it('keeps the left ship on the left and the right ship on the right', () => {
    const plan = planFormation([{ id: 'b', x: 2, y: 20 }, { id: 'a', x: 8, y: 20 }], { x: 5, y: 5 }, 'line', open);
    expect(plan.get('b')!.x).toBeLessThan(plan.get('a')!.x);
  });

  it('never crosses paths: swapping any two seats would not shorten the trip', () => {
    const units = Array.from({ length: 12 }, (_, index) => ({ id: `u${index}`, x: (index * 7) % 11, y: 30 + ((index * 5) % 4) }));
    for (const kind of FORMATIONS) {
      const plan = planFormation(units, { x: 20, y: 5 }, kind, open);
      const cost = (unit: { x: number; y: number }, seat: { x: number; y: number }) => (unit.x - seat.x) ** 2 + (unit.y - seat.y) ** 2;
      for (const a of units) for (const b of units) {
        if (a === b) continue;
        expect(cost(a, plan.get(a.id)!) + cost(b, plan.get(b.id)!)).toBeLessThanOrEqual(cost(a, plan.get(b.id)!) + cost(b, plan.get(a.id)!));
      }
    }
  });

  it('moves seats off rock to the nearest free cell', () => {
    const rock = new Set(['5,5', '6,5']);
    const plan = planFormation([{ id: 'a', x: 5, y: 9 }, { id: 'b', x: 6, y: 9 }, { id: 'c', x: 7, y: 9 }], { x: 6, y: 5 }, 'line',
      { open: (cell) => !rock.has(key(cell)) });
    const seats = [...plan.values()].map(key);
    expect(seats.some((seat) => rock.has(seat))).toBe(false);
    expect(new Set(seats).size).toBe(3);
  });

  it('is deterministic whatever order the ids arrive in', () => {
    const units = [{ id: 'x', x: 1, y: 1 }, { id: 'y', x: 2, y: 1 }, { id: 'z', x: 3, y: 2 }];
    const a = planFormation(units, { x: 10, y: 10 }, 'wedge', open);
    const b = planFormation([...units].reverse(), { x: 10, y: 10 }, 'wedge', open);
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });
});

describe('formation march in the simulation', () => {
  it('parses the group order strictly', () => {
    expect(parseCommand({ seq: 1, type: 'move_formation', squadIds: ['a', 'b'], x: 3, y: 4, formation: 'wedge' }).ok).toBe(true);
    expect(parseCommand({ seq: 1, type: 'move_formation', squadIds: ['a'], x: 3, y: 4, formation: 'blob' }).ok).toBe(false);
    expect(parseCommand({ seq: 1, type: 'move_formation', squadIds: ['a', 'a'], x: 3, y: 4, formation: 'line' }).ok).toBe(false);
  });

  it.each(FORMATIONS)('eight ships march to a %s without backing off and settle into it', (formation) => {
    const { world, seats, backwards } = march(field(), formation, 26, 8);
    // Solid shapes fill without a single step away from the seat. A column and a ring make the
    // last ships fly around seated ones, which can cost one sidestep.
    expect(backwards).toBeLessThanOrEqual(formation === 'column' || formation === 'circle' ? 2 : 0);
    for (const squad of world.squads) expect({ x: squad.x, y: squad.y }).toEqual(seats.get(squad.id));
    const expected = formationCells(formation, 8, { x: 26, y: 8 }, marchHeading({ x: 5.5, y: 32.5 }, { x: 26, y: 8 }));
    expect(new Set([...seats.values()].map(key))).toEqual(new Set(expected.map(key)));
  });

  it('mixed hulls keep together at the slowest pace and drop the pace once seated', () => {
    const kinds: UnitKind[] = ['explorer', 'interceptor', 'frigate', 'bomber'];
    const result = applyCommand(field(kinds), 'p1', { seq: 1, type: 'move_formation', squadIds: ['s0', 's1', 's2', 's3'], x: 5, y: 10, formation: 'line' });
    let world = result.world;
    const paces = new Set(world.squads.map((squad: Squad) => squad.formationPace));
    expect(paces.size).toBe(1);
    let spread = 0;
    for (let tick = 0; tick < 500; tick++) {
      world = stepWorld(world);
      const ys = world.squads.map((squad) => squad.y);
      spread = Math.max(spread, Math.max(...ys) - Math.min(...ys));
    }
    // Starting in one row they arrive as one row: nobody runs ahead of the line.
    expect(spread).toBeLessThanOrEqual(1);
    expect(world.squads.every((squad) => squad.y === 10 && squad.formationPace === undefined)).toBe(true);
  });

  it('a plain order takes a ship out of its formation pace', () => {
    let world = applyCommand(field(['explorer', 'bomber']), 'p1', { seq: 1, type: 'move_formation', squadIds: ['s0', 's1'], x: 20, y: 10, formation: 'line' }).world;
    world = applyCommand(world, 'p1', { seq: 2, type: 'move', squadId: 's0', x: 30, y: 30 }).world;
    expect(world.squads[0]!.formationPace).toBeUndefined();
    expect(world.squads[1]!.formationPace).toBeDefined();
  });

  it('rejects groups with rival or unknown ships', () => {
    const world = field(['interceptor', 'interceptor']);
    world.squads[1]!.ownerId = 'p2';
    expect(applyCommand(world, 'p1', { seq: 1, type: 'move_formation', squadIds: ['s0', 's1'], x: 20, y: 10, formation: 'box' }))
      .toMatchObject({ accepted: false, reason: 'not_owner' });
    expect(applyCommand(world, 'p1', { seq: 1, type: 'move_formation', squadIds: ['s0', 'ghost'], x: 20, y: 10, formation: 'box' }))
      .toMatchObject({ accepted: false, reason: 'unknown_squad' });
  });

  it.each(['sector-01', 'espiral'] as const)('a group crosses %s in formation and every ship reaches a seat', (map) => {
    let world = createSectorWorld(map);
    world.guardians = [];
    const base = world.players.p1.base;
    const own = world.squads.filter((squad) => squad.ownerId === 'p1');
    const extra = Array.from({ length: 6 - own.length }, (_, index) => createSquad(`extra-${index}`, 'p1', 'interceptor', base));
    world.squads = [...world.squads.filter((squad) => squad.ownerId !== 'p1'), ...own, ...extra];
    // Spread the group on free cells next to the base.
    const free = [] as { x: number; y: number }[];
    for (let r = 1; free.length < 6 && r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const cell = { x: base.x + dx, y: base.y + dy };
      if (free.length < 6 && Math.max(Math.abs(dx), Math.abs(dy)) === r && world.surface!.walkable[cell.y * world.width + cell.x]
        && !free.some((f) => f.x === cell.x && f.y === cell.y)) free.push(cell);
    }
    const group = world.squads.filter((squad) => squad.ownerId === 'p1');
    group.forEach((squad, index) => Object.assign(squad, free[index]));
    const result = applyCommand(world, 'p1', { seq: 1, type: 'move_formation', squadIds: group.map((squad) => squad.id), x: world.core.x, y: world.core.y, formation: 'box' });
    expect(result.accepted).toBe(true);
    world = result.world;
    const seats = new Map(world.squads.filter((squad) => squad.ownerId === 'p1').map((squad) => [squad.id, key(squad.target!)]));
    for (let tick = 0; tick < 3000; tick++) world = stepWorld(world);
    const arrived = world.squads.filter((squad) => squad.ownerId === 'p1' && seats.get(squad.id) === key(squad));
    expect(arrived.length).toBe(6);
  });

  it.each(['sector-01', 'espiral'] as const)('no formation order around the %s base strands a ship', (map) => {
    const template = createSectorWorld(map);
    const base = template.players.p1.base;
    const open = (x: number, y: number) => x >= 0 && y >= 0 && x < template.width && y < template.height
      && template.surface!.walkable[y * template.width + x] === true;
    const start: { x: number; y: number }[] = [];
    for (let r = 1; start.length < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++)
      if (start.length < 6 && Math.max(Math.abs(dx), Math.abs(dy)) === r && open(base.x + dx, base.y + dy)) start.push({ x: base.x + dx, y: base.y + dy });
    const stranded: string[] = [];
    for (const formation of FORMATIONS) for (let dy = -12; dy <= 12; dy += 4) for (let dx = -12; dx <= 12; dx += 4) {
      const goal = { x: base.x + dx, y: base.y + dy };
      if (!open(goal.x, goal.y)) continue;
      let world = createSectorWorld(map);
      world.guardians = [];
      world.squads = start.map((cell, index) => createSquad(`s${index}`, 'p1', index < 4 ? 'explorer' : 'interceptor', cell));
      const result = applyCommand(world, 'p1', { seq: 1, type: 'move_formation', squadIds: world.squads.map((squad) => squad.id), ...goal, formation });
      if (!result.accepted) continue;
      world = result.world;
      const seats = new Map(world.squads.map((squad) => [squad.id, key(squad.target!)]));
      for (let tick = 0; tick < 600; tick++) world = stepWorld(world);
      for (const squad of world.squads) if (seats.get(squad.id) !== key(squad)) stranded.push(`${formation} ${key(goal)} ${squad.id}`);
    }
    expect(stranded).toEqual([]);
  }, 120_000);
});


describe('formation regressions', () => {
  it('resets progress when a moving formation gets a new destination', () => {
    let world = applyCommand(field(['explorer', 'bomber']), 'p1', {
      seq: 1, type: 'move_formation', squadIds: ['s0', 's1'], x: 5, y: 10, formation: 'line',
    }).world;
    for (let tick = 0; tick < 100; tick++) world = stepWorld(world);
    const pace = world.squads[0]!.formationPace;
    expect(pace).toBeDefined();
    world = applyCommand(world, 'p1', {
      seq: 2, type: 'move_formation', squadIds: ['s0', 's1'], x: 30, y: 30, formation: 'line',
    }).world;
    expect(world.squads.every((ship) => ship.formationProgress === undefined && ship.formationWait === undefined)).toBe(true);
    for (let tick = 0; tick < 90; tick++) world = stepWorld(world);
    expect(world.squads.map((ship) => ship.formationPace)).toEqual([pace, pace]);
  });

  it('commands the whole upgraded fleet, including ships beyond 24', () => {
    const { world, seats } = march(field(Array(26).fill('interceptor')), 'box', 26, 8, 800);
    expect(seats.size).toBe(26);
    expect(new Set([...seats.values()].map(key)).size).toBe(26);
    for (const ship of world.squads) expect(key(ship)).toBe(key(seats.get(ship.id)!));
  });
});
