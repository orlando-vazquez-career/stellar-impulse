import { describe, expect, it } from 'vitest';
import { findPath } from '../src/pathfinding';
import { ALWAYS_OPEN, mapFromRows } from './helpers';

const from = { x: 0, y: 1 };
const to = { x: 6, y: 1 };

describe('pathfinding', () => {
  it('rodea los asteroides con una nave mediana', () => {
    const map = mapFromRows(['.......', '...a...', '...a...']);
    const path = findPath(map, { from, to, weight: 'medium', tick: 0 }) ?? [];
    expect(path.at(-1)).toEqual(to);
    expect(path.some((tile) => tile.x === 3 && tile.y > 0)).toBe(false);
  });

  it('una nave pesada cruza los asteroides', () => {
    const map = mapFromRows(['aaaaaaa', 'aaaaaaa', 'aaaaaaa']);
    expect(findPath(map, { from, to, weight: 'heavy', tick: 0 })).toHaveLength(6);
    expect(findPath(map, { from, to, weight: 'medium', tick: 0 })).toBeUndefined();
  });

  it('prefiere el acelerador aunque sea un poco más largo', () => {
    const map = mapFromRows(['>>>>>>>', 'sssssss', '.......']);
    const path = findPath(map, { from, to, weight: 'light', tick: 0 }) ?? [];
    expect(path.filter((tile) => tile.y === 0).length).toBeGreaterThan(3);
  });

  it('usa el agujero de gusano abierto como atajo', () => {
    const wormholes = [{ id: 'A', endpoints: [{ x: 1, y: 0 }, { x: 18, y: 0 }], cycle: ALWAYS_OPEN }];
    const map = mapFromRows(['....................'], { wormholes });
    const path = findPath(map, { from: { x: 0, y: 0 }, to: { x: 19, y: 0 }, weight: 'light', tick: 0 }) ?? [];
    expect(path).toEqual([{ x: 1, y: 0 }, { x: 18, y: 0 }, { x: 19, y: 0 }]);
  });

  it('esquiva casillas bloqueadas por otras naves', () => {
    const map = mapFromRows(['.....', '.....', '.....']);
    const blocked = (tile: { x: number; y: number }) => tile.x === 2;
    expect(findPath(map, { from, to: { x: 4, y: 1 }, weight: 'light', tick: 0, isBlocked: blocked })).toBeUndefined();
  });
});
