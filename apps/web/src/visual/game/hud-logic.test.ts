import { describe, expect, it } from 'vitest';
import { baseFactions, coreHud, hangarSlots, productionBlock } from './hud-logic';
import { createMockGameplayAdapter } from './mock-adapter';
import type { CoreViewModel, GameplayViewModel } from './model';

function view(patch: Partial<GameplayViewModel> = {}): GameplayViewModel {
  const adapter = createMockGameplayAdapter();
  const snapshot = structuredClone(adapter.getSnapshot());
  adapter.destroy();
  return { ...snapshot, ...patch };
}
const core = (patch: Partial<CoreViewModel> = {}): CoreViewModel => ({
  state: 'available', progress: 0, opensInSeconds: 0, radius: 2, captor: null,
  fractions: { own: 0, rival: 0 }, secondsLeft: null, guarded: false, ...patch,
});
const building = { kind: 'frigate' as const, remainingSeconds: 4, totalSeconds: 6, progress: 1 / 3, refund: 9 };

describe('hangar slots', () => {
  it('puts the ship in production in slot 0 and the waiting orders after it', () => {
    expect(hangarSlots(building, [{ kind: 'explorer', refund: 4 }, { kind: 'bomber', refund: 12 }])).toEqual([
      { slot: 0, kind: 'frigate', refund: 9, progress: 1 / 3, secondsLeft: 4 },
      { slot: 1, kind: 'explorer', refund: 4 },
      { slot: 2, kind: 'bomber', refund: 12 },
    ]);
  });
  it('keeps the slot numbers of waiting orders when nothing is being built', () => {
    expect(hangarSlots(null, [{ kind: 'interceptor', refund: 6 }])).toEqual([{ slot: 1, kind: 'interceptor', refund: 6 }]);
  });
  it('never lists a slot past the hangar size', () => {
    const queue = Array.from({ length: 6 }, () => ({ kind: 'explorer' as const, refund: 4 }));
    expect(hangarSlots(building, queue).map((entry) => entry.slot)).toEqual([0, 1, 2, 3, 4]);
    expect(hangarSlots(null, queue, 3).map((entry) => entry.slot)).toEqual([1, 2]);
  });
  it('reads an older production entry without a refund or progress', () => {
    expect(hangarSlots({ kind: 'explorer', remainingSeconds: 2 }, [])).toEqual([{ slot: 0, kind: 'explorer', refund: 0, secondsLeft: 2 }]);
  });
});

describe('production block', () => {
  it('lets an affordable order through an open hangar', () => {
    expect(productionBlock(view(), 'frigate')).toBeNull();
  });
  it('names what stops an order, in the order the server checks it', () => {
    const full = { production: building, productionQueue: Array.from({ length: 4 }, () => ({ kind: 'explorer' as const, refund: 4 })) };
    expect(productionBlock(view({ result: 'victory' }), 'frigate')).toBe('finished');
    expect(productionBlock(view({ ...full, productionForbidden: ['frigate'] }), 'frigate')).toBe('queue_full');
    expect(productionBlock(view({ productionForbidden: ['interceptor'] }), 'interceptor')).toBe('forbidden');
    const crowded = view({ production: building, productionQueue: [{ kind: 'explorer', refund: 4 }] });
    expect(productionBlock({ ...crowded, resources: { ...crowded.resources, fleet: 10, fleetCap: 12 } }, 'explorer')).toBe('fleet_full');
    const poor = view();
    expect(productionBlock({ ...poor, resources: { ...poor.resources, metal: 3 } }, 'frigate')).toBe('metal');
  });
});

describe('core hud', () => {
  it('counts down to the opening while locked', () => {
    expect(coreHud(core({ state: 'locked', opensInSeconds: 88 }))).toEqual({ status: 'locked', percent: 0, secondsLeft: 88, hint: null });
  });
  it('shows the captor’s own progress and time left', () => {
    expect(coreHud(core({ state: 'blue-capturing', captor: 'own', progress: 50, fractions: { own: 0.4, rival: 0.5 }, secondsLeft: 27 })))
      .toEqual({ status: 'capturing-own', percent: 40, secondsLeft: 27, hint: null });
    expect(coreHud(core({ state: 'red-capturing', captor: 'rival', progress: 50, fractions: { own: 0.5, rival: 0.25 }, secondsLeft: 34 })))
      .toEqual({ status: 'capturing-rival', percent: 25, secondsLeft: 34, hint: null });
  });
  it('explains a frozen dispute and a guarded Core', () => {
    expect(coreHud(core({ state: 'contested', progress: 30, fractions: { own: 0.3, rival: 0.1 } })))
      .toEqual({ status: 'contested', percent: 30, secondsLeft: null, hint: 'contested' });
    expect(coreHud(core({ guarded: true }))).toEqual({ status: 'idle', percent: 0, secondsLeft: null, hint: 'guardian' });
  });
});

describe('base factions', () => {
  const bases = { p1: { x: 11, y: 10 }, p2: { x: 82, y: 86 } };
  it('always paints the player’s own base blue', () => {
    expect(baseFactions({ x: 11, y: 10 }, bases)).toEqual({ p1: 'blue', p2: 'red' });
    expect(baseFactions({ x: 82, y: 86 }, bases)).toEqual({ p1: 'red', p2: 'blue' });
  });
  it('paints p1 blue before the server says which base is ours', () => {
    expect(baseFactions(undefined, bases)).toEqual({ p1: 'blue', p2: 'red' });
  });
});
