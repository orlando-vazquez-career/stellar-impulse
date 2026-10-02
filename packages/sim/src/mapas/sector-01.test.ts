import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { applyCommand, createSectorWorld, createWorldOn, stepWorld } from '../index.js';
import { findPath } from '../maps/pathfinding.js';
import { canCrossHeight, type RampDirection } from './alturas.js';
import { leerSuperficie } from './leer-tiled.js';
import mapa from './sector-01-datos.js';
import { SECTOR_01 } from './sector-01.js';

const here = path.dirname(fileURLToPath(import.meta.url));

describe('sector 01', () => {
  it('reads the handmade tiled file without inventing edges', () => {
    const file = path.join(here, '../tiled-maps/sector-01 aaaa/sector-01.tmj');
    expect(mapa).toEqual(JSON.parse(fs.readFileSync(file, 'utf8')));
    expect(SECTOR_01.width).toBe(29);
    expect(SECTOR_01.height).toBe(29);
    expect(SECTOR_01.walkable.filter(Boolean)).toHaveLength(293);
    expect(SECTOR_01.ramp.filter(Boolean)).toHaveLength(4);
    expect(SECTOR_01.level.filter((level, index) => SECTOR_01.walkable[index] && level === 1)).toHaveLength(25);
    expect(SECTOR_01.bases).toEqual({ p1: { x: 3, y: 3 }, p2: { x: 25, y: 25 } });
    expect(SECTOR_01.core).toEqual({ x: 14, y: 14 });
    expect(SECTOR_01.metals.map((cell) => [cell.x, cell.y])).toEqual([[5, 2], [17, 4], [26, 11], [2, 17], [11, 24], [23, 26]]);
    expect(SECTOR_01.captures.map((cell) => [cell.x, cell.y])).toEqual([[15, 3], [18, 12], [25, 13], [3, 15], [10, 16], [13, 25]]);
    expect(findPath(SECTOR_01, SECTOR_01.bases.p1, SECTOR_01.core).status).toBe('found');
    expect(findPath(SECTOR_01, SECTOR_01.bases.p2, SECTOR_01.core).status).toBe('found');
  });

  it('lets a ramp climb and keeps a bare cliff closed', () => {
    const rampIndex = SECTOR_01.ramp.findIndex((direction) => direction != null);
    const toward = neighborIndex(rampIndex, SECTOR_01.ramp[rampIndex]);
    expect(toward).toBeGreaterThanOrEqual(0);
    expect(canCrossHeight({ ...SECTOR_01, from: rampIndex, to: toward })).toBe(true);
    expect(SECTOR_01.level[toward]).toBeGreaterThan(SECTOR_01.level[rampIndex] ?? 0);
    const cliff = SECTOR_01.level.findIndex((level, index) => level === 0 && SECTOR_01.walkable[index]
      && SECTOR_01.ramp[index] == null && eastIsCliff(index));
    expect(cliff).toBeGreaterThanOrEqual(0);
    expect(canCrossHeight({ ...SECTOR_01, from: cliff, to: cliff + 1 })).toBe(false);
  });

  it('keeps ships on the surface, blocks occupied cells, and separates metal from capture', () => {
    const world = createWorldOn(SECTOR_01);
    const voidCell = world.surface?.walkable.findIndex((open) => !open) ?? -1;
    const blocked = applyCommand(world, 'p1', {
      seq: 1, type: 'move', squadId: 'p1-interceptor', x: voidCell % world.width, y: Math.floor(voidCell / world.width),
    });
    expect(blocked).toMatchObject({ accepted: false, reason: 'blocked_destination' });

    const ship = world.squads[0]!;
    const neighbor = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }]
      .map((offset) => ({ x: ship.x + offset.x, y: ship.y + offset.y }))
      .find((cell) => world.surface?.walkable[cell.y * world.width + cell.x] === true
        && world.surface.level[cell.y * world.width + cell.x] === world.surface.level[ship.y * world.width + ship.x]);
    expect(neighbor).toBeDefined();
    // An enemy ship holds its cell; allies may pass through each other.
    const rival = world.squads.find((squad) => squad.id === 'p2-interceptor')!;
    rival.x = neighbor!.x;
    rival.y = neighbor!.y;
    let crowded = applyCommand(world, 'p1', {
      seq: 1, type: 'move', squadId: 'p1-interceptor', x: neighbor!.x, y: neighbor!.y,
    }).world;
    for (let tick = 0; tick < 3; tick += 1) crowded = stepWorld(crowded);
    expect(crowded.squads[0]).toMatchObject({ x: ship.x, y: ship.y });

    const metal = world.nodes.find((node) => node.kind === 'metal')!;
    let mining = createSectorWorld();
    mining.guardians = mining.guardians.filter((guardian) => guardian.objectiveId !== metal.id);
    mining.squads[0]!.x = metal.x;
    mining.squads[0]!.y = metal.y;
    for (let tick = 0; tick < mining.rules.nodeCaptureTicks; tick += 1) mining = stepWorld(mining);
    expect(mining.nodes.find((node) => node.id === metal.id)?.ownerId).toBe('p1');

    const capture = world.nodes.find((node) => node.kind === 'capture')!;
    let holding = createWorldOn(SECTOR_01);
    holding.squads[0]!.x = capture.x;
    holding.squads[0]!.y = capture.y;
    for (let tick = 0; tick < holding.rules.nodeCaptureTicks; tick += 1) holding = stepWorld(holding);
    expect(holding.nodes.find((node) => node.id === capture.id)?.ownerId).toBe('p1');
    // Both worlds share the base income; only the Metal node adds its own yield.
    expect(mining.players.p1.metal).toBe(holding.players.p1.metal + 1);
  });

  it('deals more damage from the higher cell', () => {
    const rampIndex = SECTOR_01.ramp.findIndex((direction) => direction != null);
    const highIndex = neighborIndex(rampIndex, SECTOR_01.ramp[rampIndex]);
    let world = createSectorWorld();
    // Only the two duelists stay on the board.
    world.squads = world.squads.filter((squad) => squad.kind === 'interceptor');
    const low = { x: rampIndex % SECTOR_01.width, y: Math.floor(rampIndex / SECTOR_01.width) };
    const high = { x: highIndex % SECTOR_01.width, y: Math.floor(highIndex / SECTOR_01.width) };
    world.squads[0]!.x = high.x;
    world.squads[0]!.y = high.y;
    world.squads[0]!.attackTargetId = 'p2-interceptor';
    world.squads[1]!.x = low.x;
    world.squads[1]!.y = low.y;
    world.squads[1]!.attackTargetId = 'p1-interceptor';
    for (let tick = 0; tick < world.rules.attackEveryTicks; tick += 1) world = stepWorld(world);
    expect(world.squads[1]!.hp).toBe(105);
    expect(world.squads[0]!.hp).toBe(108);
  });
});

const RAMP_OFFSET: Record<RampDirection, { x: number; y: number }> = {
  'x+': { x: 1, y: 0 }, 'x-': { x: -1, y: 0 }, 'y+': { x: 0, y: 1 }, 'y-': { x: 0, y: -1 },
};

function neighborIndex(index: number, direction: RampDirection | null | undefined): number {
  if (!direction) return -1;
  const x = index % SECTOR_01.width + RAMP_OFFSET[direction].x;
  const y = Math.floor(index / SECTOR_01.width) + RAMP_OFFSET[direction].y;
  if (x < 0 || y < 0 || x >= SECTOR_01.width || y >= SECTOR_01.height) return -1;
  return y * SECTOR_01.width + x;
}

function eastIsCliff(index: number): boolean {
  if ((index + 1) % SECTOR_01.width === 0) return false;
  const neighbor = index + 1;
  return SECTOR_01.walkable[neighbor] === true && SECTOR_01.level[neighbor] === 1;
}

function tile(id: number, properties: { name: string; type: string; value: boolean | number | string }[], type: string) {
  return { id, type, properties };
}

describe('handmade reader', () => {
  it('keeps a painted floor, a closed edge and debris', () => {
    const sector = leerSuperficie({
      width: 5, height: 1, infinite: false, orientation: 'isometric', tilewidth: 64, tileheight: 32,
      tilesets: [{
        firstgid: 1,
        tiles: [
          tile(0, [{ name: 'walkable', type: 'bool', value: true }, { name: 'level', type: 'int', value: 0 }], 'plataforma'),
          tile(1, [{ name: 'walkable', type: 'bool', value: false }, { name: 'level', type: 'int', value: 0 }], 'plataforma'),
          tile(2, [{ name: 'walkable', type: 'bool', value: false }], 'escombro'),
          tile(3, [{ name: 'symbol', type: 'string', value: 'A' }], 'base jugador 1'),
          tile(4, [{ name: 'symbol', type: 'string', value: 'B' }], 'base jugador 2'),
          tile(5, [{ name: 'symbol', type: 'string', value: 'N' }], 'nucleo'),
        ],
      }],
      layers: [
        { name: 'plataforma', type: 'tilelayer', width: 5, height: 1, x: 0, y: 0, data: [1, 2, 1, 1, 1] },
        { name: 'obstaculos', type: 'tilelayer', width: 5, height: 1, x: 0, y: 0, data: [0, 0, 3, 0, 0] },
        { name: 'objetos', type: 'tilelayer', width: 5, height: 1, x: 0, y: 0, data: [4, 0, 0, 6, 5] },
      ],
    });
    expect([...sector.walkable]).toEqual([true, false, false, true, true]);
    expect(sector.bases).toEqual({ p1: { x: 0, y: 0 }, p2: { x: 4, y: 0 } });
    expect(sector.core).toEqual({ x: 3, y: 0 });
  });

  it('rejects a map without its bases', () => {
    expect(() => leerSuperficie({ width: 1, height: 1, infinite: false, orientation: 'isometric', tilesets: [], layers: [] })).toThrow();
    expect(() => leerSuperficie(null)).toThrow(/Invalid tiled map/);
  });
});
