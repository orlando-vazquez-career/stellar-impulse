import { describe, expect, it } from 'vitest';
import { canSee, createMatchWorld, createSquad, stepWorld, TRAINING_MAPS, type Squad, type World } from '../index.js';
import { visionSources } from '../augments/effects.js';
import { cloudAt, createNebula, inNebula, type NebulaCloudSpec } from './nebulosas.js';

const spec: NebulaCloudSpec = {
  id: 'prueba', home: { x: 10, y: 10 }, size: 6,
  routes: [[{ x: 11, y: 10 }, { x: 12, y: 10 }, { x: 13, y: 10 }], [{ x: 10, y: 11 }, { x: 10, y: 12 }]],
  cellsPerSecond: 1, warningSeconds: 2, holdSeconds: 3, restSeconds: 4, startSeconds: 5,
};
const field = createNebula({ clouds: [spec], slowFactor: 2, visionRadius: 2 }, 40, 40, 10)!;
const cloud = field.clouds[0]!;

describe('drifting purple nebula', () => {
  it('rests, warns, advances one cell per step, holds, comes back and switches route', () => {
    const at = (tick: number) => { const state = cloudAt(cloud, tick); return [state.phase, state.x, state.y, state.route]; };
    expect(at(0)).toEqual(['resting', 10, 10, 0]);
    expect(at(29)).toEqual(['resting', 10, 10, 0]);
    expect(cloudAt(cloud, 30)).toMatchObject({ phase: 'warning', phaseEndsAt: 50, path: [{ x: 10, y: 10 }, ...spec.routes[0]!] });
    expect(at(50)).toEqual(['advancing', 10, 10, 0]);
    expect(at(60)).toEqual(['advancing', 11, 10, 0]);
    expect(at(65)).toEqual(['advancing', 11.5, 10, 0]);
    expect(at(80)).toEqual(['holding', 13, 10, 0]);
    expect(at(110)).toEqual(['returning', 13, 10, 0]);
    expect(at(130)).toEqual(['returning', 11, 10, 0]);
    // Back home it rests and the next warning will be for the other route.
    expect(at(140)).toEqual(['resting', 10, 10, 1]);
    expect(at(180)).toEqual(['warning', 10, 10, 1]);
    expect(at(210)).toEqual(['advancing', 10, 11, 1]);
    expect(at(220)).toEqual(['holding', 10, 12, 1]);
    // A full cycle later it repeats.
    const cycle = (20 + 30 + 30 + 30 + 40) + (20 + 20 + 30 + 20 + 40);
    expect(cloudAt(cloud, 60 + cycle)).toMatchObject({ phase: 'advancing', x: 11, y: 10 });
  });

  it('covers a 6×6 square around its centre', () => {
    const world = { nebula: field, tick: 0 } as Pick<World, 'nebula' | 'tick'>;
    expect(inNebula(world, { x: 7, y: 7 })).toBe(true);
    expect(inNebula(world, { x: 12, y: 12 })).toBe(true);
    expect(inNebula(world, { x: 13, y: 10 })).toBe(false);
    expect(inNebula(world, { x: 6, y: 10 })).toBe(false);
    // Holding at the far end of route 1 the square has moved three cells.
    expect(inNebula({ ...world, tick: 80 }, { x: 15, y: 10 })).toBe(true);
    expect(inNebula({ ...world, tick: 80 }, { x: 9, y: 10 })).toBe(false);
  });
});

describe('purple nebula on Espiral Estelar II', () => {
  function quiet(): World {
    const world = createMatchWorld('espiral-2', 'skirmish', 9);
    world.augmentMatch = undefined;
    world.guardians = [];
    world.satellites = undefined;
    return world;
  }
  const nebulaCell = () => {
    const map = TRAINING_MAPS['espiral-2'];
    // The side nebula on the middle diagonal: painted, and never visited by a cloud.
    const index = map.nebula!.cells!.findIndex((inside, cell) => inside && cell % 96 < 40 && Math.floor(cell / 96) > 50);
    return { x: index % 96, y: Math.floor(index / 96) };
  };

  it('halves the speed of a ship that flies through it', () => {
    const steps = (start: { x: number; y: number }, dx: number) => {
      let world = quiet();
      const ship = createSquad('p1-runner', 'p1', 'interceptor', start, world);
      world.squads = [ship];
      ship.target = { x: start.x + dx, y: start.y };
      for (let tick = 0; tick < 40; tick += 1) world = stepWorld(world);
      return Math.abs(world.squads[0]!.x - start.x);
    };
    const map = TRAINING_MAPS['espiral-2'];
    const foggyRun = (x: number, y: number) => [0, 1, 2, 3, 4, 5, 6].every((dx) => map.nebula!.cells![y * 96 + x + dx] && map.walkable[y * 96 + x + dx]);
    // Six cells of nebula straight ahead, against six cells of clear core plaza.
    const start = map.nebula!.cells!.findIndex((inside, cell) => inside && cell % 96 < 40 && Math.floor(cell / 96) > 50 && foggyRun(cell % 96, Math.floor(cell / 96)));
    expect(start).toBeGreaterThan(0);
    const clear = steps({ x: 43, y: 48 }, 6);
    expect(clear).toBe(6);
    expect(steps({ x: start % 96, y: Math.floor(start / 96) }, 6)).toBeLessThanOrEqual(4);
  });

  it('hides a ship inside from a rival that is not right beside it, and blinds the ship', () => {
    const world = quiet();
    const cell = nebulaCell();
    const hidden = createSquad('p2-hidden', 'p2', 'interceptor', cell, world);
    const watcher = createSquad('p1-watcher', 'p1', 'explorer', { x: cell.x, y: cell.y - 4 }, world);
    world.squads = [hidden, watcher];
    expect(inNebula(world, hidden)).toBe(true);
    expect(canSee(world, 'p1', hidden)).toBe(false);
    (watcher as Squad).y = cell.y - 2;
    expect(canSee(world, 'p1', hidden)).toBe(true);
    const own = visionSources(world, 'p2').find((source) => source.position === hidden)!;
    expect(own.radius).toBe(2);
  });

  it('leaves the original Espiral Estelar without nebula effects', () => {
    expect(createMatchWorld('espiral').nebula).toBeUndefined();
  });
});
