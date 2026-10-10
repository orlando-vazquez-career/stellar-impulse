import { describe, expect, it } from 'vitest';
import {
  applyCommand, createMatchWorld, createSectorWorld, createWorldOn, grantAugment, stepWorld, TRAINING_MAPS,
  type PlayerId, type Position, type TrainingMapId, type World,
} from './index.js';
import { launchCell } from './economia.js';
import { ESPIRAL } from './mapas/espiral.js';

const ring = (a: Position, b: Position) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
/** A match world past its opening choice, so the hangar takes orders at once. */
function running(map: TrainingMapId): World {
  const world = createMatchWorld(map, 'skirmish', 3);
  world.augmentMatch!.started = true;
  for (const player of ['p1', 'p2'] as const) {
    world.augmentMatch!.players[player].offer = null;
    world.augmentMatch!.players[player].nextChoice = 3;
  }
  return world;
}

describe('ships are born outside the base hull', () => {
  it.each(Object.keys(TRAINING_MAPS) as TrainingMapId[])('keeps the %s starting fleet off both base cells', (map) => {
    const world = createSectorWorld(map);
    for (const player of ['p1', 'p2'] as const) {
      const base = world.players[player].base;
      const fleet = world.squads.filter((unit) => unit.ownerId === player);
      expect(fleet).toHaveLength(2);
      for (const ship of fleet) expect(ring(ship, base), `${map} ${ship.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it('parks the starting fleet on the first ring, mirrored for p2', () => {
    const world = createSectorWorld('espiral-2');
    const at = (id: string) => { const ship = world.squads.find((unit) => unit.id === id)!; return { x: ship.x, y: ship.y }; };
    const { p1, p2 } = world.players;
    expect(at('p1-interceptor')).toEqual({ x: p1.base.x + 1, y: p1.base.y });
    expect(at('p1-explorer')).toEqual({ x: p1.base.x + 1, y: p1.base.y + 1 });
    expect(at('p2-interceptor')).toEqual({ x: p2.base.x - 1, y: p2.base.y });
    expect(at('p2-explorer')).toEqual({ x: p2.base.x - 1, y: p2.base.y - 1 });
  });

  it('falls back to another cell of the ring, never the base, when the preferred one is closed', () => {
    const { p1 } = ESPIRAL.bases;
    const walkable = ESPIRAL.walkable.map((open, index) => index === p1.y * ESPIRAL.width + p1.x + 1 ? false : open);
    const world = createWorldOn({ ...ESPIRAL, walkable });
    const interceptor = world.squads.find((unit) => unit.id === 'p1-interceptor')!;
    expect({ x: interceptor.x, y: interceptor.y }).not.toEqual({ x: p1.x + 1, y: p1.y });
    expect({ x: interceptor.x, y: interceptor.y }).not.toEqual(p1);
    expect(ring(interceptor, p1)).toBeGreaterThanOrEqual(1);
  });

  it('launches every hangar ship around the base, never on it', () => {
    let world = running('espiral');
    // With the base cell free, the hangar still launches on the ring.
    world.squads = [];
    for (const player of ['p1', 'p2'] as const) {
      const ordered = applyCommand(world, player, { seq: 1, type: 'produce', kind: 'explorer' });
      expect(ordered.accepted).toBe(true);
      world = ordered.world;
    }
    for (let tick = 0; tick < 60; tick += 1) world = stepWorld(world);
    for (const player of ['p1', 'p2'] as PlayerId[]) {
      const ship = world.squads.find((unit) => unit.id === `${player}-explorer-1`)!;
      expect(ship).toBeDefined();
      expect(ring(ship, world.players[player].base)).toBeGreaterThanOrEqual(1);
    }
  });

  it('drops augment reinforcements around the base, never on it', () => {
    const world = running('espiral');
    world.squads = [];
    grantAugment(world, 'p1', 'p-escuadra');
    const reinforcements = world.squads.filter((unit) => unit.id.startsWith('p1-augment-'));
    expect(reinforcements.length).toBeGreaterThan(0);
    for (const ship of reinforcements) expect(ring(ship, world.players.p1.base)).toBeGreaterThanOrEqual(1);
  });

  it('scans from the inner ring it is given and keeps the base cell by default', () => {
    const open = () => true;
    const free = () => false;
    const base = { x: 5, y: 5 };
    expect(launchCell(base, 20, 20, open, free)).toEqual(base);
    expect(ring(launchCell(base, 20, 20, open, free, 1)!, base)).toBe(1);
    expect(ring(launchCell(base, 20, 20, open, free, 2)!, base)).toBe(2);
  });
});
