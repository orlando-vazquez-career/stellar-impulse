import { describe, expect, it } from 'vitest';
import { findPath } from '../maps/pathfinding.js';
import { createSectorWorld } from '../index.js';
import { launchCell } from '../economia.js';
import mapa from '../tiled-maps/espiral-estelar/espiral-estelar.json';
import { ESPIRAL, leerEspiral } from './espiral.js';

describe('espiral estelar', () => {
  it('walks the open ground and blocks asteroids and wrecks', () => {
    expect(ESPIRAL.width).toBe(96);
    expect(ESPIRAL.height).toBe(96);
    expect(ESPIRAL.bases).toEqual({ p1: { x: 11, y: 10 }, p2: { x: 82, y: 59 } });
    expect(ESPIRAL.core).toEqual({ x: 48, y: 48 });
    expect(ESPIRAL.captures.map((cell) => [cell.x, cell.y])).toEqual([[30, 31], [63, 20], [32, 75], [65, 64]]);
    expect(ESPIRAL.metals[0]).toEqual({ x: 60, y: 20 });
    expect(ESPIRAL.metals).toHaveLength(10);
    expect(ESPIRAL.walkable.filter(Boolean).length).toBeGreaterThan(1000);
    expect(ESPIRAL.walkable.filter((open) => !open).length).toBeGreaterThan(100);
    expect(ESPIRAL.walkable[ESPIRAL.core.y * ESPIRAL.width + ESPIRAL.core.x]).toBe(true);
    for (const goal of [ESPIRAL.core, ...ESPIRAL.metals, ...ESPIRAL.captures]) {
      expect(findPath(ESPIRAL, ESPIRAL.bases.p2, goal).status).toBe('found');
    }
    const world = createSectorWorld('espiral');
    expect(world.core).toMatchObject({ x: 48, y: 48 });
    expect(world.nodes.filter((node) => node.kind === 'capture')).toHaveLength(4);
    expect(world.nodes.filter((node) => node.kind === 'metal')).toHaveLength(10);
    const taken = new Set([`${ESPIRAL.bases.p1.x},${ESPIRAL.bases.p1.y}`, `${ESPIRAL.bases.p1.x + 1},${ESPIRAL.bases.p1.y + 1}`]);
    expect(launchCell(ESPIRAL.bases.p1, ESPIRAL.width, ESPIRAL.height,
      (cell) => ESPIRAL.walkable[cell.y * ESPIRAL.width + cell.x] === true,
      (cell) => taken.has(`${cell.x},${cell.y}`))).not.toBeNull();
  });

  it('rejects a map without its logic layer', () => {
    expect(() => leerEspiral({})).toThrow(/Invalid tiled map/);
  });

  it('reads walkability when Tiled exports tilesets as external tsx', () => {
    const tilesets = (mapa as { tilesets: { source?: string }[] }).tilesets;
    expect(tilesets.some((set) => typeof set.source === 'string' && set.source.includes('logica.tsx'))).toBe(true);
    expect(ESPIRAL.walkable.some((open) => !open)).toBe(true);
  });

  it('ignores Tiled objects that are not match objectives', () => {
    const copy = structuredClone(mapa) as {
      layers: { name: string; objects?: { type: string; x: number; y: number; properties?: unknown[] }[] }[];
    };
    const layer = copy.layers.find((entry) => entry.name === 'objetos');
    if (!layer?.objects) throw new Error('Missing objetos layer');
    layer.objects.push({ type: '', x: 10, y: 10, properties: [] });
    layer.objects.push({ type: 'valla_laser', x: -40, y: 500, properties: [] });
    expect(leerEspiral(copy).bases).toEqual(ESPIRAL.bases);
  });
});
