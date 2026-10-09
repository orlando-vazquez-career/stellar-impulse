import { describe, expect, it, vi } from 'vitest';
import { createMockGameplayAdapter } from './mock-adapter';
import { createTutorialObserver, markTutorialSeen, tutorialWasSeen } from './tutorial';
import type { GameplayViewModel } from './model';

function fixture(): GameplayViewModel {
  const adapter = createMockGameplayAdapter();
  const view = structuredClone(adapter.getSnapshot());
  adapter.destroy();
  view.selectedSquadIds = [];
  view.nodes = [{ id: 'metal', kind: 'metal', x: 15, y: 13, owner: null }];
  view.base = { damage: 12, range: 4, upgrades: { damage: 0, capacity: 0 }, upgradeCosts: { damage: 10, capacity: 10 }, modules: { refinery: 0, extras: [], building: null } };
  return view;
}

describe('first practice tutorial', () => {
  it('waits for actual movement, a launched ship, node ownership and completed refinery', () => {
    const view = fixture();
    const observe = createTutorialObserver(view);
    expect(observe.observe(view)).toBe(0);
    const selected = { ...view, selectedSquadIds: ['blue-alpha'] };
    expect(observe.observe(selected)).toBe(1);
    const moving = { ...selected, moveOrder: { squadId: 'blue-alpha', destination: { x: 15, y: 13 }, route: [] } };
    expect(observe.observe(moving)).toBe(1); // Optimistic command alone is insufficient.
    const moved = structuredClone(moving);
    moved.squads[0]!.gridX += 1;
    expect(observe.observe(moved)).toBe(2);
    const queued = { ...moved, production: { kind: 'interceptor' as const, remainingSeconds: 2 } };
    expect(observe.observe(queued)).toBe(2);
    const launched = { ...queued, production: null, squads: [...queued.squads, { ...queued.squads[0]!, id: 'new' }] };
    expect(observe.observe(launched)).toBe(3);
    const captured = { ...launched, nodes: [{ ...view.nodes[0]!, owner: 'blue' as const }] };
    expect(observe.observe(captured)).toBe(4);
    const building = structuredClone(captured);
    building.base!.modules!.building = { kind: 'refinery', remainingSeconds: 3 };
    expect(observe.observe(building)).toBe(4);
    const built = structuredClone(building);
    built.base!.modules!.refinery = 1;
    expect(observe.observe(built)).toBe(5);
  });

  it('does not count free spawns as production, enemies as selection, or pre-owned nodes as a capture', () => {
    const view = fixture();
    view.nodes[0]!.owner = 'blue';
    const observe = createTutorialObserver(view);
    expect(observe.observe({ ...view, selectedSquadIds: ['red-sigma'] })).toBe(0);
    observe.skip(); observe.skip();
    const spawned = { ...view, squads: [...view.squads, { ...view.squads[0]!, id: 'free' }] };
    expect(observe.observe(spawned)).toBe(2);
    observe.skip();
    expect(observe.observe(spawned)).toBe(3);
  });

  it('can skip steps and preserves earlier real captures', () => {
    const view = fixture(), observe = createTutorialObserver(view);
    observe.observe({ ...view, nodes: [{ ...view.nodes[0]!, owner: 'blue' }] });
    observe.skip(); observe.skip(); observe.skip();
    expect(observe.observe(view)).toBe(4);
  });

  it('persists completion and tolerates blocked localStorage', () => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key), setItem: (key: string, value: string) => values.set(key, value) });
    expect(tutorialWasSeen()).toBe(false);
    markTutorialSeen(); expect(tutorialWasSeen()).toBe(true);
    vi.stubGlobal('localStorage', { getItem() { throw Error('blocked'); }, setItem() { throw Error('blocked'); } });
    expect(tutorialWasSeen()).toBe(false);
    expect(markTutorialSeen).not.toThrow();
    vi.unstubAllGlobals();
  });
});
