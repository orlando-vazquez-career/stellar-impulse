import { describe, expect, it } from 'vitest';
import { BATTLEFIELD_MAP } from './battlefield.js';
import { defineMapSpec, type MapSpec } from './types.js';
import { parseTiledJson } from './tiled.js';

const small = (): MapSpec => ({
  id: 'small', version: 1, width: 2, height: 2, cellSize: 72,
  bases: { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } },
  objectives: [{ id: 'core', kind: 'core', cell: { x: 1, y: 1 }, guardianId: 'core-guardian', guardianCell: { x: 1, y: 1 } }],
  walkable: [true, true, true, true], opaque: [false, false, false, false],
});

describe('map catalog contract', () => {
  it('ships an open 72x72 grid aligned with current 72px art and symmetric starts', () => {
    expect(BATTLEFIELD_MAP).toMatchObject({ id: 'battlefield', version: 1, width: 72, height: 72, cellSize: 72 });
    expect(BATTLEFIELD_MAP.walkable).toHaveLength(72 * 72);
    expect(BATTLEFIELD_MAP.walkable.every(Boolean)).toBe(true);
    expect(BATTLEFIELD_MAP.opaque.some(Boolean)).toBe(false);
    expect(BATTLEFIELD_MAP.bases.p1).toEqual({ x: BATTLEFIELD_MAP.bases.p2.y, y: BATTLEFIELD_MAP.bases.p2.x });
    expect(BATTLEFIELD_MAP.objectives.find((objective) => objective.kind === 'core')?.cell).toEqual({ x: 36, y: 36 });
  });

  it('accepts masks imported only from explicit Tiled gameplay layers', () => {
    const tiled = parseTiledJson(JSON.stringify({
      type: 'map', orientation: 'orthogonal', infinite: false, width: 2, height: 2, tilewidth: 72, tileheight: 72,
      tilesets: [{ firstgid: 1, tilecount: 1 }],
      layers: [
        { name: 'Terreno', type: 'tilelayer', width: 2, height: 2, data: [1, 1, 1, 1] },
        { name: 'nav-blocked', type: 'tilelayer', width: 2, height: 2, data: [0, 0, 1, 0] },
        { name: 'vision-opaque', type: 'tilelayer', width: 2, height: 2, data: [0, 0, 1, 0] },
      ],
    }));
    const map = defineMapSpec({ ...small(), width: tiled.width, height: tiled.height, cellSize: tiled.cellSize,
      walkable: tiled.walkable, opaque: tiled.opaque });
    expect(map.walkable).toEqual([true, true, false, true]);
    expect(map.opaque).toEqual([false, false, true, false]);
  });

  it('copies and deeply freezes catalog content', () => {
    const input = small();
    const map = defineMapSpec(input);
    (input.walkable as boolean[])[0] = false;
    (input.bases.p1 as { x: number }).x = 1;
    expect(map.walkable[0]).toBe(true);
    expect(map.bases.p1.x).toBe(0);
    expect(Object.isFrozen(map.objectives[0]!.guardianCell)).toBe(true);
    expect(Object.isFrozen(map.walkable)).toBe(true);
  });

  it('rejects sparse masks and overlapping live guardian/base cells', () => {
    expect(() => defineMapSpec({ ...small(), walkable: new Array<boolean>(4) })).toThrow();
    expect(() => defineMapSpec({ ...small(), opaque: new Array<boolean>(4) })).toThrow();
    const colliding = small();
    expect(() => defineMapSpec({ ...colliding, objectives: [
      ...colliding.objectives,
      { id: 'metal-1', kind: 'metal', cell: { x: 0, y: 1 }, guardianId: 'metal-guardian', guardianCell: { x: 1, y: 1 } },
    ] })).toThrow();
    expect(() => defineMapSpec({ ...small(), objectives: [
      { id: 'core', kind: 'core', cell: { x: 1, y: 1 }, guardianId: 'core-guardian', guardianCell: { x: 0, y: 0 } },
    ] })).toThrow();
  });
});
