import { describe, expect, it } from 'vitest';
import { effectiveVisionRadius, FogOfWar, isUnitVisible, Visibility } from '../src/fog-of-war';
import { mapFromRows } from './helpers';

const open = mapFromRows(Array.from({ length: 11 }, () => '...........'));

describe('niebla de guerra', () => {
  it('despeja el radio de visión de la nave', () => {
    const fog = new FogOfWar(open);
    fog.update(open, [{ tile: { x: 5, y: 5 }, visionRadius: 3 }], 0);
    expect(fog.isVisible({ x: 8, y: 5 })).toBe(true);
    expect(fog.isVisible({ x: 9, y: 5 })).toBe(false);
  });

  it('lo que se vio queda explorado cuando la nave se va', () => {
    const fog = new FogOfWar(open);
    fog.update(open, [{ tile: { x: 1, y: 1 }, visionRadius: 2 }], 0);
    fog.update(open, [{ tile: { x: 9, y: 9 }, visionRadius: 2 }], 1);
    expect(fog.stateAt({ x: 1, y: 1 })).toBe(Visibility.Explored);
    expect(fog.stateAt({ x: 5, y: 1 })).toBe(Visibility.Unexplored);
  });

  it('dentro de la nebulosa la visión se reduce, salvo para el explorador', () => {
    const map = mapFromRows(['nnnnn', 'nnnnn', 'nnnnn']);
    expect(effectiveVisionRadius(map, { tile: { x: 2, y: 1 }, visionRadius: 6 }, 0)).toBe(3);
    expect(effectiveVisionRadius(map, { tile: { x: 2, y: 1 }, visionRadius: 6, seesThroughNebula: true }, 0)).toBe(6);
  });

  it('los asteroides tapan lo que hay detrás', () => {
    const map = mapFromRows(['.....', '..a..', '.....']);
    const fog = new FogOfWar(map);
    fog.update(map, [{ tile: { x: 0, y: 1 }, visionRadius: 5 }], 0);
    expect(fog.isVisible({ x: 2, y: 1 })).toBe(true);
    expect(fog.isVisible({ x: 4, y: 1 })).toBe(false);
  });

  it('una nave dentro de la nebulosa no se ve desde fuera, salvo pegado a ella', () => {
    const map = mapFromRows(['....nn']);
    expect(isUnitVisible(map, [{ tile: { x: 0, y: 0 }, visionRadius: 8 }], { x: 5, y: 0 }, 0)).toBe(false);
    expect(isUnitVisible(map, [{ tile: { x: 4, y: 0 }, visionRadius: 8 }], { x: 5, y: 0 }, 0)).toBe(true);
  });
});
