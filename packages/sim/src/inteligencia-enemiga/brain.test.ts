import { describe, expect, it } from 'vitest';
import { INITIAL_MEMORY, runEnemyAi, thinkUnit } from './brain.js';
import type { AiMemory, AiUnit, AiWorld, Vec2 } from './types.js';

function makeUnit(id: string, position: Vec2, overrides: Partial<AiUnit> = {}): AiUnit {
  return { id, position, health: 100, maxHealth: 100, attackRange: 2, sightRange: 6, ...overrides };
}

function makeWorld(enemies: AiUnit[], route: Vec2[] = [{ x: 10, y: 0 }]): AiWorld {
  return {
    enemiesOf: () => enemies,
    patrolRouteOf: () => route,
    retreatPointOf: () => ({ x: 0, y: 0 }),
  };
}

const memoryIn = (state: AiMemory['state'], targetId: string | null = null): AiMemory => ({
  ...INITIAL_MEMORY, state, targetId,
});

describe('máquina de estados del enemigo', () => {
  it('patrulla hacia su punto cuando no ve a nadie', () => {
    const { memory, order } = thinkUnit(makeUnit('e1', { x: 0, y: 0 }), makeWorld([]), INITIAL_MEMORY);
    expect(memory.state).toBe('patrol');
    expect(order).toEqual({ kind: 'move', unitId: 'e1', destination: { x: 10, y: 0 } });
  });

  it('persigue al enemigo que entra en su visión', () => {
    const player = makeUnit('p1', { x: 5, y: 0 });
    const { memory, order } = thinkUnit(makeUnit('e1', { x: 0, y: 0 }), makeWorld([player]), INITIAL_MEMORY);
    expect(memory).toMatchObject({ state: 'chase', targetId: 'p1' });
    expect(order).toEqual({ kind: 'move', unitId: 'e1', destination: { x: 5, y: 0 } });
  });

  it('ataca cuando el objetivo entra en rango', () => {
    const player = makeUnit('p1', { x: 1, y: 0 });
    const { memory, order } = thinkUnit(makeUnit('e1', { x: 0, y: 0 }), makeWorld([player]), memoryIn('chase', 'p1'));
    expect(memory.state).toBe('attack');
    expect(order).toEqual({ kind: 'attack', unitId: 'e1', targetId: 'p1' });
  });

  it('vuelve a perseguir si el objetivo sale del rango de ataque', () => {
    const player = makeUnit('p1', { x: 4, y: 0 });
    const { memory } = thinkUnit(makeUnit('e1', { x: 0, y: 0 }), makeWorld([player]), memoryIn('attack', 'p1'));
    expect(memory.state).toBe('chase');
  });

  it('vuelve a patrullar si destruye a su objetivo', () => {
    const { memory } = thinkUnit(makeUnit('e1', { x: 0, y: 0 }), makeWorld([]), memoryIn('attack', 'p1'));
    expect(memory).toMatchObject({ state: 'patrol', targetId: null });
  });

  it('huye con poca vida y no vuelve hasta recuperarse bien', () => {
    const player = makeUnit('p1', { x: 1, y: 0 });
    const hurt = makeUnit('e1', { x: 0, y: 0 }, { health: 20 });
    const fled = thinkUnit(hurt, makeWorld([player]), memoryIn('attack', 'p1'));
    expect(fled.memory.state).toBe('retreat');
    expect(fled.order).toEqual({ kind: 'move', unitId: 'e1', destination: { x: 0, y: 0 } });
    const halfHealed = makeUnit('e1', { x: 0, y: 0 }, { health: 50 });
    expect(thinkUnit(halfHealed, makeWorld([]), fled.memory).memory.state).toBe('retreat');
  });

  it('trata vida máxima en cero como daño grave', () => {
    const broken = makeUnit('e1', { x: 0, y: 0 }, { health: 0, maxHealth: 0 });
    expect(thinkUnit(broken, makeWorld([]), INITIAL_MEMORY).memory.state).toBe('retreat');
  });

  it('no repite la misma orden en pensamientos seguidos', () => {
    const unit = makeUnit('e1', { x: 0, y: 0 });
    const first = thinkUnit(unit, makeWorld([]), INITIAL_MEMORY);
    const second = thinkUnit(unit, makeWorld([]), first.memory);
    expect(second.order).toBeNull();
  });

  it('ante dos enemigos a igual distancia elige siempre el mismo', () => {
    const enemies = [makeUnit('p2', { x: 0, y: 3 }), makeUnit('p1', { x: 3, y: 0 })];
    const { memory } = thinkUnit(makeUnit('e1', { x: 0, y: 0 }), makeWorld(enemies), INITIAL_MEMORY);
    expect(memory.targetId).toBe('p1');
  });

  it('reparte el pensamiento de las unidades entre ticks', () => {
    const units = [makeUnit('e1', { x: 0, y: 0 }), makeUnit('e2', { x: 1, y: 1 })];
    const { orders } = runEnemyAi(units, makeWorld([]), new Map(), 0);
    expect(orders.map((order) => order.unitId)).toEqual(['e1']);
  });
});
