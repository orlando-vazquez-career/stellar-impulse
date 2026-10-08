import { describe, expect, it } from 'vitest';
import { layoutForTiledMap, tileToWorld, worldToTile } from '../client/iso-projection';
import { pick } from '../client/picking';

const layout = layoutForTiledMap(58, 64, 32);

describe('proyección isométrica', () => {
  it('convierte ida y vuelta entre casilla y mundo', () => {
    for (const tile of [{ x: 0, y: 0 }, { x: 10, y: 3 }, { x: 57, y: 57 }]) {
      expect(worldToTile(layout, tileToWorld(layout, tile))).toEqual(tile);
    }
  });
});

describe('picking', () => {
  it('elige la nave aunque el clic caiga sobre su cuerpo flotante', () => {
    const ground = tileToWorld(layout, { x: 5, y: 5 });
    const unit = { id: 7, ground, liftPx: 18, hitRadiusX: 16, hitRadiusY: 10 };
    expect(pick(layout, { x: ground.x, y: ground.y - 18 }, [unit])).toEqual({ kind: 'unit', unitId: 7 });
  });

  it('si no hay nave devuelve la casilla', () => {
    const point = tileToWorld(layout, { x: 3, y: 4 });
    expect(pick(layout, point, [])).toEqual({ kind: 'tile', tile: { x: 3, y: 4 } });
  });
});
