import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { PlayerView } from '@impulso/state';
import { diffViews, nearestOpenCell, rememberView, type FogMemory } from './server-adapter';
import { selectMap } from '../map/sector-map';

const ship = (id: string, ownerId: 'p1' | 'p2', x: number, y: number, hp = 100) =>
  ({ id, ownerId, kind: 'interceptor' as const, x, y, hp, maxHp: 120, damage: 12 });

function view(patch: Partial<PlayerView> = {}): PlayerView {
  return {
    schemaVersion: 1, mode: 'training', tick: 100, playerId: 'p1', width: 29, height: 29, obstacles: [],
    rules: { tickRate: 10, moveEveryTicks: 3, attackEveryTicks: 10, visionRadius: 4, captureRadius: 1, nodeCaptureTicks: 30, coreOpenTick: 1200, coreCaptureTicks: 300 },
    players: { p1: { id: 'p1', base: { x: 3, y: 3 }, metal: 6 }, p2: { id: 'p2', base: { x: 25, y: 25 } } },
    squads: [], guardians: [], nodes: [],
    core: { id: 'core', guardianId: 'core-guardian', x: 14, y: 14, open: false, progress: { p1: 0, p2: 0 } },
    visibleCells: [{ x: 5, y: 5 }], winner: null,
    ...patch,
  };
}

describe('match events from server views', () => {
  it('announces the start on the first view', () => {
    expect(diffViews(null, view())).toEqual([{ kind: 'match-start' }]);
  });

  it('counts an enemy as destroyed only when its cell is still in sight', () => {
    const before = view({ squads: [ship('p2-a', 'p2', 5, 5), ship('p2-b', 'p2', 9, 9)] });
    const events = diffViews(before, view({ squads: [] }));
    expect(events).toEqual([{ kind: 'ship-destroyed', own: false }]);
  });

  it('reports own losses, node captures, the core opening and the result', () => {
    const before = view({
      squads: [ship('p1-a', 'p1', 3, 3)],
      nodes: [{ id: 'metal-1', kind: 'metal', guardianId: 'g', x: 5, y: 2, ownerId: null, progress: { p1: 0, p2: 0 } }],
    });
    const after = view({
      tick: 1200, squads: [ship('p1-a', 'p1', 3, 3, 0)],
      nodes: [{ id: 'metal-1', kind: 'metal', guardianId: 'g', x: 5, y: 2, ownerId: 'p1', progress: { p1: 30, p2: 0 } }],
      core: { id: 'core', guardianId: 'core-guardian', x: 14, y: 14, open: true, progress: { p1: 0, p2: 4 } },
      winner: 'p2',
    });
    expect(diffViews(before, after).map((event) => event.kind)).toEqual([
      'ship-destroyed', 'node-captured', 'core-soon', 'core-open', 'core-rival-capturing', 'defeat',
    ]);
  });
});

describe('click snapping', () => {
  beforeEach(() => {
    selectMap('sector-01');
  });
  afterEach(() => {
    selectMap('espiral');
  });

  it('moves an edge click onto the nearest open cell and ignores the void', () => {
    expect(nearestOpenCell(2.4, 11)).toEqual({ x: 3, y: 11 });
    expect(nearestOpenCell(9, 0.2)).toBeNull();
  });
});

describe('fog memory', () => {
  it('keeps explored cells and the last seen owner of nodes that leave sight', () => {
    const memory: FogMemory = { explored: null, nodes: new Map() };
    const node = { id: 'metal-1', kind: 'metal' as const, guardianId: 'g', x: 5, y: 5, ownerId: 'p2' as const, progress: { p1: 0, p2: 30 } };
    expect(rememberView(memory, view({ visibleCells: [{ x: 5, y: 5 }], nodes: [node] }))).toBe(true);
    expect(rememberView(memory, view({ visibleCells: [{ x: 3, y: 3 }], nodes: [] }))).toBe(true);
    expect(memory.explored![5 * 29 + 5]).toBe(true);
    expect(memory.explored![3 * 29 + 3]).toBe(true);
    expect(memory.explored![0]).toBe(false);
    expect(memory.nodes.get('metal-1')).toMatchObject({ owner: 'red', stale: true });
    // Seeing only explored cells again adds nothing new to remember.
    expect(rememberView(memory, view({ visibleCells: [{ x: 5, y: 5 }], nodes: [{ ...node, ownerId: 'p1' }] }))).toBe(false);
    expect(memory.nodes.get('metal-1')).toMatchObject({ owner: 'blue', stale: false });
  });
});
