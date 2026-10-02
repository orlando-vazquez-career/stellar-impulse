import { describe, expect, it } from 'vitest';
import { findPath } from '../maps/pathfinding.js';
import { createSectorWorld } from '../index.js';
import { ESPIRAL, leerEspiral } from './espiral.js';

describe('espiral estelar', () => {
  it('walks the open ground and blocks asteroids and wrecks', () => {
    expect(ESPIRAL.width).toBe(58);
    expect(ESPIRAL.height).toBe(58);
    expect(ESPIRAL.bases).toEqual({ p1: { x: 11, y: 11 }, p2: { x: 46, y: 46 } });
    expect(ESPIRAL.core).toEqual({ x: 29, y: 29 });
    expect(ESPIRAL.captures.map((cell) => [cell.x, cell.y])).toEqual([[23, 13], [48, 18], [9, 39], [34, 44]]);
    expect(ESPIRAL.metals[0]).toEqual({ x: 14, y: 5 });
    expect(ESPIRAL.metals).toHaveLength(8);
    expect(ESPIRAL.walkable.filter(Boolean).length).toBeGreaterThan(1000);
    expect(ESPIRAL.walkable[28 * ESPIRAL.width + 28]).toBe(false);
    expect(ESPIRAL.walkable[ESPIRAL.core.y * ESPIRAL.width + ESPIRAL.core.x]).toBe(true);
    for (const goal of [ESPIRAL.core, ...ESPIRAL.metals, ...ESPIRAL.captures]) {
      expect(findPath(ESPIRAL, ESPIRAL.bases.p1, goal).status).toBe('found');
      expect(findPath(ESPIRAL, ESPIRAL.bases.p2, goal).status).toBe('found');
    }
    const world = createSectorWorld();
    expect(world.core).toMatchObject({ x: 29, y: 29 });
    expect(world.nodes.filter((node) => node.kind === 'capture')).toHaveLength(4);
    expect(world.nodes.filter((node) => node.kind === 'metal')).toHaveLength(8);
  });

  it('rejects a map without its logic layer', () => {
    expect(() => leerEspiral({})).toThrow(/Invalid tiled map/);
  });
});
