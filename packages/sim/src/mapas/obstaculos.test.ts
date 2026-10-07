import { describe, expect, it } from 'vitest';
import { leerEspiral } from './espiral.js';
import { obstacleCells } from './obstaculos.js';

const SIDE = 12;
const TILE = 32;
function mapWith(objects: Record<string, unknown>[]) {
  const point = (id: number, type: string, x: number, y: number, properties: unknown[] = []) =>
    ({ id, type, point: true, x: x * TILE + 16, y: y * TILE + 16, properties });
  return {
    width: SIDE, height: SIDE, tilewidth: 64, tileheight: TILE,
    tilesets: [{ firstgid: 1, tiles: [{ id: 0, properties: [{ name: 'terrain', value: 'empty' }] }] }],
    layers: [
      { name: 'logica', data: Array.from({ length: SIDE * SIDE }, () => 1) },
      { name: 'objetos', objects: [
        point(1, 'spawn', 1, 1, [{ name: 'owner', value: 1 }]), point(2, 'spawn', 10, 10, [{ name: 'owner', value: 2 }]),
        point(3, 'pilar', 6, 6), point(4, 'recurso', 3, 8), point(5, 'pronexo', 8, 3), ...objects,
      ] },
    ],
  };
}
const open = (sector: ReturnType<typeof leerEspiral>, x: number, y: number) => sector.walkable[y * SIDE + x];

describe('map obstacles', () => {
  it('closes the cells around every OBSTACLE_RING point', () => {
    const sector = leerEspiral(mapWith([
      { id: 20, type: 'OBSTACLE_RING', point: true, x: 4.5 * TILE, y: 4.5 * TILE, properties: [{ name: 'modelo', value: 'satelite' }] },
      { id: 21, type: 'OBSTACLE_RING', point: true, x: 8.5 * TILE, y: 8.5 * TILE, properties: [{ name: 'modelo', value: 'cristales' }] },
    ]));
    expect(sector.obstaculos?.map((obstacle) => [obstacle.id, obstacle.model, obstacle.cells.length])).toEqual([[20, 'satelite', 1], [21, 'cristales', 5]]);
    expect(open(sector, 4, 4)).toBe(false);
    expect(open(sector, 5, 4)).toBe(true);
    for (const [x, y] of [[8, 8], [7, 8], [9, 8], [8, 7], [8, 9]]) expect(open(sector, x!, y!)).toBe(false);
    expect(open(sector, 7, 7)).toBe(true);
  });

  it('never closes an objective', () => {
    const sector = leerEspiral(mapWith([
      { id: 31, type: 'OBSTACLE_RING', point: true, x: 6.5 * TILE, y: 6.5 * TILE, properties: [{ name: 'modelo', value: 'cristales' }] },
    ]));
    // The pillar's own cell stays open; the ring around it is blocked.
    expect(open(sector, 6, 6)).toBe(true);
    expect(open(sector, 5, 6)).toBe(false);
  });

  it('picks a model by id when the point names none, and rejects unknown ones', () => {
    const sector = leerEspiral(mapWith([{ id: 40, type: 'OBSTACLE_RING', point: true, x: 4.5 * TILE, y: 4.5 * TILE }]));
    expect(sector.obstaculos?.[0]?.model).toBe('nave_destruida_1');
    expect(() => leerEspiral(mapWith([
      { id: 41, type: 'OBSTACLE_RING', point: true, x: 64, y: 64, properties: [{ name: 'modelo', value: 'dragon' }] },
    ]))).toThrow(/Unknown obstacle model/);
  });

  it('furnishes a rectangle with obstacles that stay inside it and leave gaps', () => {
    const area = { id: 30, type: 'OBSTACLE_RING', x: 2 * TILE, y: 4 * TILE, width: 6 * TILE, height: 4 * TILE };
    const sector = leerEspiral(mapWith([area]));
    const again = leerEspiral(mapWith([area]));
    const placed = sector.obstaculos ?? [];
    expect(placed.length).toBeGreaterThan(1);
    expect(again.obstaculos).toEqual(placed);
    for (const cell of placed.flatMap((obstacle) => obstacle.cells)) {
      expect(cell.x).toBeGreaterThanOrEqual(2);
      expect(cell.x).toBeLessThan(8);
      expect(cell.y).toBeGreaterThanOrEqual(4);
      expect(cell.y).toBeLessThan(8);
      expect(open(sector, cell.x, cell.y)).toBe(false);
    }
    let free = 0;
    for (let y = 4; y < 8; y += 1) for (let x = 2; x < 8; x += 1) if (open(sector, x, y)) free += 1;
    expect(free).toBeGreaterThan(0);
  });

  it('skips any obstacle that would cut a base off from an objective', () => {
    // A gap one cell wide in a wall is the only way from base 1 to the rest of the map.
    const map = mapWith([{ id: 50, type: 'OBSTACLE_RING', x: 0, y: 2 * TILE, width: 3 * TILE, height: TILE }]);
    map.tilesets[0]!.tiles.push({ id: 5, properties: [{ name: 'terrain', value: 'blocked' }] });
    const logic = map.layers[0] as { data: number[] };
    for (let x = 0; x < SIDE; x += 1) if (x !== 1) logic.data[2 * SIDE + x] = 6;
    const sector = leerEspiral(map);
    expect(open(sector, 1, 2)).toBe(true);
    expect(sector.obstaculos).toEqual([]);
  });

  it('keeps the footprint inside the map', () => {
    expect(obstacleCells(0.5, 0.5, 2, SIDE, SIDE).every((cell) => cell.x >= 0 && cell.y >= 0)).toBe(true);
    expect(obstacleCells(0.5, 0.5, 0, SIDE, SIDE)).toEqual([{ x: 0, y: 0 }]);
  });
});
