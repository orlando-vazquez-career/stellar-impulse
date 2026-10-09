import { describe, expect, it } from 'vitest';
import { isOpenAt, phaseAt } from '../src/cycle';
import { canEnterTile, terrainAt, wormholeExit } from '../src/game-map';
import { ALWAYS_CLOSED, ALWAYS_OPEN, mapFromRows } from './helpers';

describe('ciclos', () => {
  const cycle = { periodTicks: 100, openTicks: 40, offsetTicks: 0 };

  it('abre y cierra según el tick', () => {
    expect(isOpenAt(cycle, 0)).toBe(true);
    expect(isOpenAt(cycle, 39)).toBe(true);
    expect(isOpenAt(cycle, 40)).toBe(false);
    expect(isOpenAt(cycle, 100)).toBe(true);
  });

  it('informa la fase para sincronizar la animación', () => {
    expect(phaseAt(cycle, 2, 10).phase).toBe('opening');
    expect(phaseAt(cycle, 20, 10).phase).toBe('open');
    expect(phaseAt(cycle, 35, 10).phase).toBe('closing');
    expect(phaseAt(cycle, 60, 10).phase).toBe('closed');
  });
});

describe('terreno', () => {
  it('solo las naves pesadas entran a los asteroides', () => {
    const map = mapFromRows(['.a.']);
    expect(canEnterTile(map, { x: 1, y: 0 }, 'medium', 0)).toBe(false);
    expect(canEnterTile(map, { x: 1, y: 0 }, 'heavy', 0)).toBe(true);
  });

  it('un paso de asteroides abierto se comporta como espacio vacío', () => {
    const gate = { tiles: [{ x: 1, y: 0 }], cycle: ALWAYS_OPEN };
    const map = mapFromRows(['.a.'], { gates: [gate] });
    expect(terrainAt(map, { x: 1, y: 0 }, 0)).toBe('empty');
  });

  it('un agujero de gusano lleva al siguiente extremo solo si está abierto', () => {
    const endpoints = [{ x: 0, y: 0 }, { x: 4, y: 0 }];
    const open = mapFromRows(['.....'], { wormholes: [{ id: 'A', endpoints, cycle: ALWAYS_OPEN }] });
    const closed = mapFromRows(['.....'], { wormholes: [{ id: 'A', endpoints, cycle: ALWAYS_CLOSED }] });
    expect(wormholeExit(open, { x: 0, y: 0 }, 0)).toEqual({ x: 4, y: 0 });
    expect(wormholeExit(closed, { x: 0, y: 0 }, 0)).toBeUndefined();
  });
});
