import { describe, expect, it } from 'vitest';
import { cellToIso, isoToPoint } from './isometric';
import { advanceFreeMove, planFreeMove } from './free-movement';
import { ASTEROIDS, BASE_CELLS, BLOCKING_TERRAIN } from './asteroids';

describe('free movement on the visual field', () => {
  it('preserves fractional click coordinates through the isometric projection', () => {
    const point = { x: 14.25, y: 17.6 };
    const screen = cellToIso(point.x, point.y);
    const restored = isoToPoint(screen.x, screen.y);
    expect(restored?.x).toBeCloseTo(point.x);
    expect(restored?.y).toBeCloseTo(point.y);
  });

  it('moves directly at any angle with a constant travel distance', () => {
    const route = planFreeMove({ x: 2, y: 3 }, { x: 5, y: 7 }, []);
    expect(route).toHaveLength(2);
    const next = advanceFreeMove(route, 1);
    expect(next[0]?.x).toBeCloseTo(2.6);
    expect(next[0]?.y).toBeCloseTo(3.8);
    expect(next[1]).toEqual({ x: 5, y: 7 });
    expect(advanceFreeMove(next, 4)).toEqual([{ x: 5, y: 7 }]);
  });

  it('rejects destinations outside the field or inside an asteroid', () => {
    expect(planFreeMove({ x: 2, y: 3 }, { x: 96, y: 7 }, [])).toEqual([]);
    expect(planFreeMove({ x: 2, y: 3 }, { x: 5.2, y: 7 }, [{ x: 5, y: 7 }])).toEqual([]);
  });

  it('uses free-angle waypoints when fixed terrain blocks the straight line', () => {
    const route = planFreeMove({ x: 1, y: 1 }, { x: 5, y: 1 }, [{ x: 3, y: 1 }]);
    expect(route[0]).toEqual({ x: 1, y: 1 });
    expect(route.at(-1)).toEqual({ x: 5, y: 1 });
    expect(route.length).toBeGreaterThan(2);
    expect(route.some((point) => point.y !== 1)).toBe(true);
  });
  it('routes around the visible asteroid field', () => {
    const route = planFreeMove({ x: 48, y: 46 }, { x: 53, y: 47 }, [...ASTEROIDS]);
    expect(route[0]).toEqual({ x: 48, y: 46 });
    expect(route.at(-1)).toEqual({ x: 53, y: 47 });
    expect(route.length).toBeGreaterThan(2);
  });
  it('treats both bases as fixed structures and leaves their approaches open', () => {
    expect(ASTEROIDS.length).toBeGreaterThan(30);
    expect(BASE_CELLS.blue.x).toBeLessThan(10);
    expect(BASE_CELLS.blue.y).toBeGreaterThan(85);
    expect(BASE_CELLS.red.x).toBeGreaterThan(85);
    expect(BASE_CELLS.red.y).toBeLessThan(10);
    expect(planFreeMove({ x: 48, y: 48 }, BASE_CELLS.blue, [...BLOCKING_TERRAIN])).toEqual([]);
    expect(planFreeMove({ x: 48, y: 48 }, BASE_CELLS.red, [...BLOCKING_TERRAIN])).toEqual([]);
    expect(planFreeMove({ x: 1, y: 90 }, { x: 10, y: 90 }, [...BLOCKING_TERRAIN]).length).toBeGreaterThan(2);
  });
});
