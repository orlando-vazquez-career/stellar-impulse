import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { findPath } from '../maps/pathfinding.js';
import { createMatchWorld, createSectorWorld, stepWorld, TRAINING_MAPS, type World } from '../index.js';
import { ESPIRAL_2 } from './espiral-2.js';
import { parseTiledTsx } from './tsx-tileset.js';
import mapa from '../tiled-maps/espiral-estelar_2/espiral-estelar_2.json';

const mirror = (cell: { x: number; y: number }) => ({ x: cell.y, y: cell.x });
const SATELLITE_WAVE_TIMEOUT_MS = 60_000;

function objectGid(object: object): number | undefined {
  if (!('gid' in object) || typeof object.gid !== 'number') return undefined;
  return object.gid;
}

describe('espiral estelar II', () => {
  it('keeps the 96×96 kit: bases at the sides, the core in the middle, 4 pronexos and 10 resources', () => {
    expect(TRAINING_MAPS['espiral-2']).toBe(ESPIRAL_2);
    expect([ESPIRAL_2.width, ESPIRAL_2.height]).toEqual([96, 96]);
    expect(ESPIRAL_2.bases).toEqual({ p1: { x: 11, y: 83 }, p2: { x: 83, y: 11 } });
    expect(ESPIRAL_2.core).toEqual({ x: 48, y: 48, radius: 2 });
    expect(ESPIRAL_2.captures).toHaveLength(4);
    expect(ESPIRAL_2.captures.map((cell) => cell.radius)).toEqual([3, 3, 3, 3]);
    expect(ESPIRAL_2.metals).toHaveLength(10);
    const world = createSectorWorld('espiral-2');
    expect(world.nodes.filter((node) => node.kind === 'capture')).toHaveLength(4);
    expect(world.nodes.filter((node) => node.kind === 'metal')).toHaveLength(10);
  });

  it('is a mirror of itself, so both fleets travel the same distances', () => {
    const { width, walkable } = ESPIRAL_2;
    for (let y = 0; y < width; y += 1) for (let x = 0; x < width; x += 1) {
      expect(walkable[y * width + x], `${x},${y}`).toBe(walkable[x * width + y]);
    }
    expect(ESPIRAL_2.bases.p2).toEqual(mirror(ESPIRAL_2.bases.p1));
    const key = (cell: { x: number; y: number }) => `${cell.x},${cell.y}`;
    expect(new Set(ESPIRAL_2.metals.map(mirror).map(key))).toEqual(new Set(ESPIRAL_2.metals.map(key)));
    expect(new Set(ESPIRAL_2.captures.map(mirror).map(key))).toEqual(new Set(ESPIRAL_2.captures.map(key)));
    for (const goal of [ESPIRAL_2.core, ...ESPIRAL_2.metals, ...ESPIRAL_2.captures]) {
      const p1 = findPath(ESPIRAL_2, ESPIRAL_2.bases.p1, goal);
      const p2 = findPath(ESPIRAL_2, ESPIRAL_2.bases.p2, mirror(goal));
      expect(p1.status).toBe('found');
      expect(p2.status).toBe('found');
      if (p1.status === 'found' && p2.status === 'found') expect(p1.path.length).toBe(p2.path.length);
    }
  });

  it('has wide lanes: every open cell has room around it', () => {
    const { width, walkable } = ESPIRAL_2;
    const open = (x: number, y: number) => walkable[y * width + x] === true;
    let cramped = 0, total = 0;
    for (let y = 1; y < width - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
      if (!open(x, y)) continue;
      total += 1;
      // A lane at least four cells across always leaves an open 2×2 block touching the cell.
      const blocks = [[0, 0], [-1, 0], [0, -1], [-1, -1]].some(([dx, dy]) =>
        open(x + dx!, y + dy!) && open(x + dx! + 1, y + dy!) && open(x + dx!, y + dy! + 1) && open(x + dx! + 1, y + dy! + 1));
      if (!blocks) cramped += 1;
    }
    expect(total).toBeGreaterThan(3000);
    expect(cramped / total).toBeLessThan(0.02);
  });

  it('paints six purple nebulae that slow and hide ships', () => {
    const nebula = ESPIRAL_2.nebula!;
    expect(nebula.slowFactor).toBe(2);
    expect(nebula.visionRadius).toBe(2);
    const cells = nebula.cells!;
    const seen = new Set<number>();
    let zones = 0;
    for (let start = 0; start < cells.length; start += 1) {
      if (!cells[start] || seen.has(start)) continue;
      zones += 1;
      const queue = [start];
      seen.add(start);
      while (queue.length) {
        const cell = queue.pop()!;
        const x = cell % 96, y = Math.floor(cell / 96);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const next = (y + dy) * 96 + x + dx;
          if (x + dx >= 0 && x + dx < 96 && y + dy >= 0 && y + dy < 96 && cells[next] && !seen.has(next)) { seen.add(next); queue.push(next); }
        }
      }
    }
    expect(zones).toBe(6);
    // Every nebula cell can be flown through.
    cells.forEach((inside, index) => { if (inside) expect(ESPIRAL_2.walkable[index]).toBe(true); });
  });

  it('sends three clouds out of three nebulae, each with two mirrored routes of at most 13 cells', () => {
    const clouds = ESPIRAL_2.nebula!.clouds;
    expect(clouds).toHaveLength(3);
    for (const cloud of clouds) {
      expect(cloud.size).toBe(6);
      expect(ESPIRAL_2.nebula!.cells![cloud.home.y * 96 + cloud.home.x]).toBe(true);
      expect(cloud.routes).toHaveLength(2);
      for (const route of cloud.routes) {
        expect(route.length).toBeGreaterThan(8);
        expect(route.length).toBeLessThanOrEqual(13);
        // One eight-way step at a time.
        [cloud.home, ...route].slice(1).forEach((cell, index) => {
          const previous = index === 0 ? cloud.home : route[index - 1]!;
          expect(Math.max(Math.abs(cell.x - previous.x), Math.abs(cell.y - previous.y))).toBe(1);
        });
      }
      expect(cloud.routes[1]).toEqual(cloud.routes[0]!.map(mirror));
    }
  });

  it('stands antennas and satellites on the lanes as obstacles, one of them animated', () => {
    const xml = readFileSync(new URL('../tiled-maps/espiral-estelar_2/tilesets/decorado_externo.tsx', import.meta.url), 'utf8');
    const decorado = parseTiledTsx({ xml, firstgid: 118, tsxPathFromMap: 'tilesets/decorado_externo.tsx' });
    const beacon = decorado.tiles!.find((tile) => tile.animation?.length)!;
    expect(beacon.animation).toHaveLength(8);
    const placed = mapa.layers.find((layer) => layer.name === 'estructuras')!.objects!.filter((object) => (objectGid(object) ?? 0) >= 118);
    expect(placed.length).toBeGreaterThanOrEqual(30);
    expect(placed.some((object) => objectGid(object) === 118 + beacon.id)).toBe(true);
    // Each one closes the cells under it, and the destroyed ships add their own.
    expect(ESPIRAL_2.obstaculos!.length).toBeGreaterThanOrEqual(20);
  });

  it('drops satellites on eight zones in two groups of four that take turns', { timeout: SATELLITE_WAVE_TIMEOUT_MS }, () => {
    const zones = ESPIRAL_2.dropZones ?? [];
    expect(zones).toHaveLength(8);
    expect(zones.filter((zone) => zone.group === 1)).toHaveLength(4);
    expect(zones.filter((zone) => zone.group === 2)).toHaveLength(4);
    let world: World = createMatchWorld('espiral-2', 'skirmish', 5);
    world.augmentMatch = undefined;
    world.guardians = [];
    const waves: { tick: number; zones: string[] }[] = [];
    let seen = new Set<string>();
    while (waves.length < 4 && world.tick < 3000) {
      world = stepWorld(world);
      const fresh = world.satellites!.falls.filter((fall) => !seen.has(fall.id));
      if (fresh.length) waves.push({ tick: world.tick, zones: fresh.map((fall) => fall.zoneId).sort() });
      seen = new Set(world.satellites!.falls.map((fall) => fall.id));
    }
    const groupOf = (id: string) => zones.find((zone) => zone.id === id)!.group;
    expect(waves.map((wave) => wave.zones.length)).toEqual([4, 4, 4, 4]);
    expect(waves.map((wave) => new Set(wave.zones.map(groupOf)).size)).toEqual([1, 1, 1, 1]);
    expect(waves.map((wave) => groupOf(wave.zones[0]!))).toEqual([1, 2, 1, 2]);
    // 45 s per group, so a group falls every 22.5 s.
    expect(waves.map((wave) => wave.tick)).toEqual([450, 675, 900, 1125]);
  });
});
