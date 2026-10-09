import { describe, expect, it } from 'vitest';
import { createSectorWorld, createSquad, stepWorld, TRAINING_MAPS, type World } from '../index.js';

const advance = (world: World, ticks: number): World => {
  let next = world;
  for (let tick = 0; tick < ticks; tick += 1) next = stepWorld(next);
  return next;
};
const turretOf = (world: World) => world.guardians.find((unit) => unit.id === 'torreta-2')!;

describe('neutral turrets', () => {
  it('guards every pronexo and the core of Espiral Estelar', () => {
    const sector = TRAINING_MAPS.espiral;
    expect(sector.turrets).toHaveLength(6);
    for (const turret of sector.turrets!) expect(sector.walkable[turret.y * sector.width + turret.x]).toBe(true);
    const world = createSectorWorld('espiral');
    const posts = world.guardians.filter((unit) => unit.role === 'turret').map((unit) => unit.objectiveId).sort();
    expect(posts).toEqual(['capture-1', 'capture-2', 'capture-3', 'capture-4', 'core', 'core']);
    // Each pronexo turret reaches its whole capture area.
    for (const node of world.nodes.filter((candidate) => candidate.kind === 'capture')) {
      const turret = world.guardians.find((unit) => unit.role === 'turret' && unit.objectiveId === node.id)!;
      expect(Math.max(Math.abs(turret.x - node.x), Math.abs(turret.y - node.y)) + node.radius!).toBeLessThanOrEqual(turret.range!);
    }
  });

  it('fires at ships of both sides from range, never moves and can be destroyed', () => {
    const world = createSectorWorld('espiral');
    const turret = turretOf(world);
    const hp = (state: World, id: string) => state.squads.find((unit) => unit.id === id)!.hp;
    // An unarmed rival scout inside its reach is fired at as well.
    const scouted = structuredClone(world);
    scouted.squads.push(createSquad('p2-near', 'p2', 'explorer', { x: turret.x - 2, y: turret.y - 3 }, scouted));
    expect(hp(advance(scouted, 10), 'p2-near')).toBeLessThan(hp(scouted, 'p2-near'));

    world.squads.push(createSquad('p1-near', 'p1', 'frigate', { x: turret.x - 3, y: turret.y }, world));
    world.squads.push(createSquad('p1-far', 'p1', 'frigate', { x: turret.x - 6, y: turret.y - 2 }, world));
    const hit = advance(world, 10);
    expect(hp(hit, 'p1-near')).toBeLessThan(hp(world, 'p1-near'));
    expect(hp(hit, 'p1-far')).toBe(hp(world, 'p1-far'));
    expect(turretOf(hit).lastShot).toMatchObject({ tick: 10 });
    // The idle frigate answers on its own and brings the turret down, at a price.
    const later = advance(hit, 400);
    expect(turretOf(later)).toMatchObject({ x: turret.x, y: turret.y, hp: 0 });
    expect(hp(later, 'p1-near')).toBeGreaterThan(100);
    expect(hp(later, 'p1-near')).toBeLessThan(170);
  });
});
