import { describe, expect, it, vi } from 'vitest';
import { createMockGameplayAdapter } from './mock-adapter';
import { sectorSurface } from '../map/sector-map';

describe('visual presentation adapter', () => {
  it('retires moving selected ships, clears selection and frees housing without a refund', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    try {
      adapter.dispatch({ type: 'select-squads', squadIds: ['blue-alpha', 'blue-beta'] });
      adapter.dispatch({ type: 'move-selected', x: 14, y: 14 });
      const metal = adapter.getSnapshot().resources.metal;
      adapter.dispatch({ type: 'disband-selected' });
      vi.advanceTimersByTime(2000);
      expect(adapter.getSnapshot().selectedSquadIds).toEqual([]);
      expect(adapter.getSnapshot().moveOrder).toBeNull();
      expect(adapter.getSnapshot().resources.fleet).toBe(1);
      expect(adapter.getSnapshot().resources.metal).toBe(metal);
      expect(adapter.getSnapshot().squads.filter((unit) => unit.owner === 'blue' && unit.visible).map((unit) => unit.id))
        .toEqual(['blue-gamma']);
    } finally { adapter.destroy(); vi.useRealTimers(); }
  });
  it('updates base levels and capacity from Metal and stops at the maximum', () => {
    const adapter = createMockGameplayAdapter();
    try {
      for (let i = 0; i < 4; i++) adapter.dispatch({ type: 'upgrade-base', upgrade: 'capacity' });
      expect(adapter.getSnapshot().resources).toMatchObject({ metal: 180, fleetCap: 24 });
      expect(adapter.getSnapshot().base?.upgrades.capacity).toBe(3);
      expect(adapter.getSnapshot().base?.upgradeCosts.capacity).toBeNull();
      adapter.dispatch({ type: 'upgrade-base', upgrade: 'damage' });
      expect(adapter.getSnapshot().base?.damage).toBe(10);
    } finally { adapter.destroy(); }
  });
  it('spawns on the playable Tiled surface and rejects blocked move orders', () => {
    const adapter = createMockGameplayAdapter();
    const alpha = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha')!;
    expect(sectorSurface.walkable[Math.round(alpha.gridY) * sectorSurface.width + Math.round(alpha.gridX)]).toBe(true);
    const blocked = sectorSurface.walkable.findIndex((walkable) => !walkable);
    adapter.dispatch({ type: 'move-selected', x: blocked % sectorSurface.width, y: Math.floor(blocked / sectorSurface.width) });
    expect(adapter.getSnapshot().moveOrder).toBeNull();
    adapter.destroy();
  });
  it('updates selection and visual actions without mutating authoritative state', () => {
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
    adapter.dispatch({ type: 'set-action', action: 'move' });
    const snapshot = adapter.getSnapshot();
    expect(snapshot.selectedSquadId).toBe('blue-beta');
    expect(snapshot.activeAction).toBe('move');
    expect(snapshot.squads.find((squad) => squad.id === 'blue-beta')?.selected).toBe(true);
    expect(snapshot.squads.find((squad) => squad.id === 'blue-alpha')?.selected).toBe(false);
    adapter.destroy();
  });

  it('clamps development controls to presentation-safe ranges', () => {
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'set-core-progress', progress: 180 });
    adapter.dispatch({ type: 'set-selected-health', healthPercent: -20 });
    const snapshot = adapter.getSnapshot();
    expect(snapshot.core.progress).toBe(100);
    expect(snapshot.squads.find((squad) => squad.selected)?.healthPercent).toBe(0);
    adapter.destroy();
  });

  it('moves the selected allied squad toward an unoccupied exact destination', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 14, y: 13 });
    expect(adapter.getSnapshot().moveOrder?.route).toEqual([{ x: 12, y: 13 }, { x: 14, y: 13 }]);
    expect(adapter.getSnapshot().activeAction).toBeNull();
    adapter.dispatch({ type: 'set-action', action: 'move' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 14, y: 14 });
    expect(adapter.getSnapshot().moveOrder?.destination).toEqual({ x: 14, y: 14 });
    adapter.dispatch({ type: 'move-squad', squadId: 'red-sigma', x: 14, y: 14 });
    expect(adapter.getSnapshot().moveOrder?.squadId).toBe('blue-alpha');
    vi.advanceTimersByTime(3000);
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha')).toMatchObject({ gridX: 14, gridY: 14, status: 'idle' });
    expect(adapter.getSnapshot().moveOrder).toBeNull();
    adapter.destroy();
    vi.useRealTimers();
  });

  it('only accepts point-and-click orders for the selected visible ally', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'select-squad', squadId: 'red-sigma' });
    expect(adapter.getSnapshot().selectedSquadId).toBe('blue-alpha');
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-beta', x: 14, y: 15 });
    expect(adapter.getSnapshot().moveOrder).toBeNull();
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-beta', x: 14, y: 15 });
    expect(adapter.getSnapshot().moveOrder?.squadId).toBe('blue-beta');
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-alpha' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 14, y: 13 });
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')?.status).toBe('moving');
    expect(adapter.getSnapshot().moveOrder?.squadId).toBe('blue-alpha');
    vi.advanceTimersByTime(50);
    const betaX = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')!.gridX;
    const alphaX = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha')!.gridX;
    expect(betaX).toBeGreaterThan(13);
    expect(betaX).toBeLessThan(13.1);
    expect(alphaX).toBeGreaterThan(12);
    expect(alphaX).toBeLessThan(12.1);
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
    expect(adapter.getSnapshot().moveOrder?.route[0]?.x).toBeCloseTo(betaX);
    adapter.destroy();
    vi.useRealTimers();
  });

  it('selects only living allies and issues movement and attack orders to the group', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'select-squads', squadIds: ['blue-alpha', 'blue-beta', 'red-sigma', 'blue-beta'] });
    expect(adapter.getSnapshot().selectedSquadIds).toEqual(['blue-alpha', 'blue-beta']);
    adapter.dispatch({ type: 'move-selected', x: 14, y: 14 });
    const moving = adapter.getSnapshot().squads.filter((squad) => squad.selected);
    expect(moving.map((squad) => squad.status)).toEqual(['moving', 'moving']);
    vi.advanceTimersByTime(50);
    const advanced = adapter.getSnapshot().squads.filter((squad) => squad.selected);
    expect(advanced[0]!.gridX).toBeGreaterThan(12);
    expect(advanced[1]!.gridX).toBeGreaterThan(13);
    adapter.dispatch({ type: 'attack-selected', targetId: 'red-sigma' });
    expect(adapter.getSnapshot().squads.filter((squad) => squad.selected).map((squad) => squad.attackTargetId))
      .toEqual(['red-sigma', 'red-sigma']);
    adapter.dispatch({ type: 'select-squads', squadIds: [] });
    expect(adapter.getSnapshot().selectedSquadIds).toEqual([]);
    expect(adapter.getSnapshot().selectedSquadId).toBeNull();
    adapter.destroy();
    vi.useRealTimers();
  });

  it('advances diagonally in both axes rather than taking cardinal steps', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 14.5, y: 14.25 });
    expect(adapter.getSnapshot().moveOrder?.destination).toEqual({ x: 14.5, y: 14.25 });
    vi.advanceTimersByTime(50);
    const alpha = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha');
    expect(alpha?.gridX).toBeGreaterThan(12);
    expect(alpha?.gridY).toBeGreaterThan(13);
    adapter.destroy();
    vi.useRealTimers();
  });
  it('adds a slower selectable bomber and rejects blocked Tiled cells', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    const gamma = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-gamma');
    expect(gamma?.unitType).toBe('bomber');
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-gamma' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-gamma', x: 0, y: 0 });
    expect(adapter.getSnapshot().moveOrder).toBeNull();
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-gamma', x: 14, y: 15 });
    vi.advanceTimersByTime(5000);
    const moved = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-gamma')!;
    expect(Math.hypot(moved.gridX - 12, moved.gridY - 15)).toBeGreaterThan(0);
    const beta = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')!;
    expect(Math.hypot(moved.gridX - beta.gridX, moved.gridY - beta.gridY)).toBeGreaterThanOrEqual(0.9);
    adapter.destroy();
    vi.useRealTimers();
  });
  it('chases and damages a selected visible enemy, then cancels on a move order', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
    adapter.dispatch({ type: 'attack-squad', squadId: 'blue-beta', targetId: 'blue-alpha' });
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')?.attackTargetId).toBeUndefined();
    adapter.dispatch({ type: 'attack-squad', squadId: 'blue-beta', targetId: 'red-sigma' });
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')?.attackTargetId).toBe('red-sigma');
    vi.advanceTimersByTime(6000);
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'red-sigma')!.healthPercent).toBeLessThan(68);
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-beta', x: 14, y: 15 });
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')?.attackTargetId).toBeNull();
    adapter.destroy();
    vi.useRealTimers();
  });

  it('caps a delayed movement callback so ships do not teleport after a stalled frame', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    try {
      adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 14, y: 13 });
      vi.setSystemTime(Date.now() + 450);
      vi.advanceTimersByTime(50);
      const x = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha')!.gridX;
      expect(x).toBeGreaterThan(12);
      expect(x).toBeLessThan(12.2);
    } finally {
      adapter.destroy();
      vi.useRealTimers();
    }
  });

  it('uses elapsed time for attacks when a timer callback is delayed', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    try {
      adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
      adapter.dispatch({ type: 'move-selected', x: 16, y: 14 });
      vi.advanceTimersByTime(10000);
      adapter.dispatch({ type: 'attack-selected', targetId: 'red-sigma' });
      vi.setSystemTime(Date.now() + 450);
      vi.advanceTimersByTime(50);
      expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'red-sigma')?.healthPercent).toBe(62.1);
    } finally {
      adapter.destroy();
      vi.useRealTimers();
    }
  });

  it('completes an attack redirected during movement', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    try {
      adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
      adapter.dispatch({ type: 'move-selected', x: 16, y: 14 });
      vi.advanceTimersByTime(100);
      adapter.dispatch({ type: 'attack-selected', targetId: 'red-sigma' });
      vi.advanceTimersByTime(20000);
      expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'red-sigma'))
        .toMatchObject({ healthPercent: 0, visible: false, status: 'destroyed' });
    } finally {
      adapter.destroy();
      vi.useRealTimers();
    }
  });

  it('notifies subscribers and cleans the optional clock lifecycle', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    const listener = vi.fn();
    const unsubscribe = adapter.subscribe(listener);
    adapter.dispatch({ type: 'set-clock-running', running: true });
    vi.advanceTimersByTime(1000);
    expect(adapter.getSnapshot().elapsedSeconds).toBe(269);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    adapter.destroy();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('stops beside an occupied click and never overlaps another living ship during travel', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    try {
      adapter.dispatch({ type: 'move-selected', x: 13, y: 15 });
      const destination = adapter.getSnapshot().moveOrder!.destination;
      expect(Math.hypot(destination.x - 13, destination.y - 15)).toBeGreaterThanOrEqual(0.9);
      for (let frame = 0; frame < 200; frame++) {
        vi.advanceTimersByTime(50);
        const ships = adapter.getSnapshot().squads.filter((ship) => ship.healthPercent > 0);
        for (let i = 0; i < ships.length; i++) for (let j = i + 1; j < ships.length; j++) {
          expect(Math.hypot(ships[i]!.gridX - ships[j]!.gridX, ships[i]!.gridY - ships[j]!.gridY))
            .toBeGreaterThanOrEqual(0.9 - 1e-8);
        }
      }
      expect(adapter.getSnapshot().squads[0]).toMatchObject({ gridX: destination.x, gridY: destination.y, status: 'idle' });
    } finally { adapter.destroy(); vi.useRealTimers(); }
  });

  it('can redirect into an attack while an ally is crossing nearby', () => {
    vi.useFakeTimers();
    for (const delay of [100, 600, 1500]) {
      const adapter = createMockGameplayAdapter();
      try {
        adapter.dispatch({ type: 'move-selected', x: 13, y: 15 });
        vi.advanceTimersByTime(delay);
        adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
        adapter.dispatch({ type: 'move-selected', x: 15, y: 13 });
        vi.advanceTimersByTime(150);
        adapter.dispatch({ type: 'attack-selected', targetId: 'red-sigma' });
        vi.advanceTimersByTime(20000);
        expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'red-sigma'))
          .toMatchObject({ healthPercent: 0, visible: false });
      } finally { adapter.destroy(); }
    }
    vi.useRealTimers();
  });
});
