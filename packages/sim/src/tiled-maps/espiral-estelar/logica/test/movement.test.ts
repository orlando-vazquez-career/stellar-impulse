import { describe, expect, it } from 'vitest';
import { assignMoveTargets, nearestEnterableTile } from '../src/click-targets';
import { advanceUnits, createMovingUnit, DEFAULT_MOVEMENT_RULES, orderMove, type MovingUnit } from '../src/movement';
import { TileOccupancy } from '../src/occupancy';
import { mapFromRows } from './helpers';
import type { GameMap } from '../src/game-map';

function setup(map: GameMap, units: MovingUnit[]) {
  const occupancy = new TileOccupancy(map);
  units.forEach((unit) => occupancy.moveTo(unit.id, unit.tile));
  return { map, occupancy, tick: 0, rules: DEFAULT_MOVEMENT_RULES };
}

function ticksToArrive(map: GameMap, speedPerTick: number): number {
  const unit = createMovingUnit(1, 'light', speedPerTick, { x: 0, y: 0 });
  const context = setup(map, [unit]);
  orderMove(context, unit, { x: 4, y: 0 });
  let tick = 0;
  while (unit.goal && tick < 100) advanceUnits(map, [unit], context.occupancy, ++tick);
  return tick;
}

describe('velocidad por terreno', () => {
  it('el desacelerador tarda el doble y el acelerador menos', () => {
    const normal = ticksToArrive(mapFromRows(['.....']), 250);
    expect(ticksToArrive(mapFromRows(['sssss']), 250)).toBe(normal * 2);
    expect(ticksToArrive(mapFromRows(['>>>>>']), 250)).toBeLessThan(normal);
  });
});

describe('bloqueo de cuerpos', () => {
  it('dos naves nunca ocupan la misma casilla', () => {
    const map = mapFromRows(['.....', '.....', '.....']);
    const units = [createMovingUnit(1, 'light', 1000, { x: 0, y: 1 }), createMovingUnit(2, 'light', 1000, { x: 4, y: 1 })];
    const context = setup(map, units);
    units.forEach((unit) => orderMove(context, unit, { x: 2, y: 1 }));
    for (let tick = 1; tick <= 10; tick++) {
      advanceUnits(map, units, context.occupancy, tick);
      expect(units[0]?.tile).not.toEqual(units[1]?.tile);
    }
  });

  it('una nave bloqueada en un pasillo espera y luego pasa', () => {
    const map = mapFromRows(['#####', '.....', '#####']);
    const units = [createMovingUnit(1, 'light', 1000, { x: 1, y: 1 }), createMovingUnit(2, 'light', 1000, { x: 0, y: 1 })];
    const context = setup(map, units);
    orderMove(context, units[0] as MovingUnit, { x: 4, y: 1 });
    orderMove(context, units[1] as MovingUnit, { x: 3, y: 1 });
    for (let tick = 1; tick <= 8; tick++) advanceUnits(map, units, context.occupancy, tick);
    expect(units[0]?.tile).toEqual({ x: 4, y: 1 });
    expect(units[1]?.tile).toEqual({ x: 3, y: 1 });
  });
});

describe('objetivos de clic', () => {
  const map = mapFromRows(['.....', '..a..', '.....']);

  it('ajusta el clic sobre asteroides a la casilla libre más cercana', () => {
    expect(nearestEnterableTile({ map, tick: 0 }, { x: 2, y: 1 }, 'medium')).not.toEqual({ x: 2, y: 1 });
    expect(nearestEnterableTile({ map, tick: 0 }, { x: 2, y: 1 }, 'heavy')).toEqual({ x: 2, y: 1 });
  });

  it('da un destino distinto a cada nave seleccionada', () => {
    const units = [1, 2, 3, 4].map((id) => ({ id, tile: { x: 0, y: 0 }, weight: 'medium' as const }));
    const targets = [...assignMoveTargets({ map, tick: 0 }, { x: 2, y: 1 }, units).values()];
    expect(new Set(targets.map((tile) => `${tile.x},${tile.y}`)).size).toBe(4);
  });
});
