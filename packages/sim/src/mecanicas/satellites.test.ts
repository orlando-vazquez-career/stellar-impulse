import { describe, expect, it } from 'vitest';
import { createMatchWorld, createSquad, stepWorld, TRAINING_MAPS, type World } from '../index.js';

function untilFall(world: World, limit = 2000): World {
  for (let tick = 0; tick < limit && world.satellites!.falls.length === 0; tick += 1) world = stepWorld(world);
  return world;
}
function started(seed = 7): World {
  const world = createMatchWorld('espiral', 'skirmish', seed);
  world.augmentMatch = undefined;
  world.guardians = [];
  return world;
}

describe('falling satellites', () => {
  it('reads the drop zones painted in Tiled', () => {
    const zones = TRAINING_MAPS.espiral.dropZones ?? [];
    expect(zones).toHaveLength(4);
    for (const zone of zones) {
      expect(zone).toMatchObject({ damage: 40, radius: 1, intervalSeconds: 45, warningSeconds: 4, amount: 1 });
      let open = 0;
      for (let y = zone.y; y < zone.y + zone.height; y += 1) for (let x = zone.x; x < zone.x + zone.width; x += 1) {
        if (TRAINING_MAPS.espiral.walkable[y * TRAINING_MAPS.espiral.width + x]) open += 1;
      }
      expect(open).toBeGreaterThan(10);
    }
    expect(TRAINING_MAPS['sector-01'].dropZones).toBeUndefined();
  });

  it('warns first, lands inside its zone and damages every ship under the blast', () => {
    let world = untilFall(started());
    const fall = world.satellites!.falls[0]!;
    const zone = world.satellites!.zones.find((candidate) => candidate.id === fall.zoneId)!;
    expect(fall.impactTick - fall.warnTick).toBe(40);
    expect(fall.x).toBeGreaterThanOrEqual(zone.x);
    expect(fall.x).toBeLessThan(zone.x + zone.width);
    expect(fall.y).toBeGreaterThanOrEqual(zone.y);
    expect(fall.y).toBeLessThan(zone.y + zone.height);
    expect(world.surface!.walkable[fall.y * world.width + fall.x]).toBe(true);
    // Unarmed explorers, so the only damage in play is the satellite's.
    world.squads = [
      createSquad('p1-under', 'p1', 'explorer', fall, world),
      createSquad('p2-under', 'p2', 'explorer', { x: fall.x + 1, y: fall.y }, world),
      createSquad('p1-far', 'p1', 'explorer', { x: fall.x + 3, y: fall.y }, world),
    ];
    while (world.tick < fall.impactTick - 1) world = stepWorld(world);
    expect(world.squads.map((unit) => unit.hp)).toEqual([50, 50, 50]);
    world = stepWorld(world);
    expect(world.squads.map((unit) => unit.hp)).toEqual([10, 10, 50]);
    while (world.satellites!.falls.some((candidate) => candidate.id === fall.id)) world = stepWorld(world);
    expect(world.tick).toBe(fall.impactTick + 10);
  });

  it('is deterministic per seed and reports the ships it destroys', () => {
    const a = untilFall(started(3)), b = untilFall(started(3));
    expect(a.satellites!.falls).toEqual(b.satellites!.falls);
    let world = a;
    const fall = world.satellites!.falls[0]!;
    const scout = createSquad('p2-scout', 'p2', 'explorer', fall, world);
    scout.hp = 5;
    world.squads = [scout];
    while (world.tick < fall.impactTick) world = stepWorld(world);
    expect(world.squads[0]!.hp).toBe(0);
    expect(world.events).toContainEqual(expect.objectContaining({ type: 'destroyed', attackerOwner: null, victimId: 'p2-scout', attackerId: fall.id }));
  });
});
