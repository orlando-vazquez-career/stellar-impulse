import { describe, expect, it, vi } from 'vitest';
import { createMockGameplayAdapter } from './mock-adapter';

describe('visual presentation adapter', () => {
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

  it('moves the selected allied squad toward the exact destination and allows shared ship positions', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 47, y: 47 });
    expect(adapter.getSnapshot().moveOrder?.route).toEqual([{ x: 44, y: 47 }, { x: 47, y: 47 }]);
    expect(adapter.getSnapshot().activeAction).toBeNull();
    adapter.dispatch({ type: 'set-action', action: 'move' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 45, y: 49 });
    expect(adapter.getSnapshot().moveOrder?.destination).toEqual({ x: 45, y: 49 });
    adapter.dispatch({ type: 'move-squad', squadId: 'red-sigma', x: 50, y: 50 });
    expect(adapter.getSnapshot().moveOrder?.squadId).toBe('blue-alpha');
    vi.advanceTimersByTime(750);
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha')).toMatchObject({ gridX: 45, gridY: 49, status: 'idle' });
    expect(adapter.getSnapshot().moveOrder).toBeNull();
    adapter.destroy();
    vi.useRealTimers();
  });

  it('only accepts point-and-click orders for the selected visible ally', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'select-squad', squadId: 'red-sigma' });
    expect(adapter.getSnapshot().selectedSquadId).toBe('blue-alpha');
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-beta', x: 47, y: 49 });
    expect(adapter.getSnapshot().moveOrder).toBeNull();
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-beta', x: 47, y: 49 });
    expect(adapter.getSnapshot().moveOrder?.squadId).toBe('blue-beta');
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-alpha' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 47, y: 47 });
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')?.status).toBe('moving');
    expect(adapter.getSnapshot().moveOrder?.squadId).toBe('blue-alpha');
    vi.advanceTimersByTime(50);
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')?.gridX).toBeCloseTo(45.15);
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha')?.gridX).toBeCloseTo(44.2);
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-beta' });
    expect(adapter.getSnapshot().moveOrder?.route[0]?.x).toBeCloseTo(45.15);
    adapter.destroy();
    vi.useRealTimers();
  });

  it('selects only living allies and issues movement and attack orders to the group', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'select-squads', squadIds: ['blue-alpha', 'blue-beta', 'red-sigma', 'blue-beta'] });
    expect(adapter.getSnapshot().selectedSquadIds).toEqual(['blue-alpha', 'blue-beta']);
    adapter.dispatch({ type: 'move-selected', x: 48, y: 52 });
    const moving = adapter.getSnapshot().squads.filter((squad) => squad.selected);
    expect(moving.map((squad) => squad.status)).toEqual(['moving', 'moving']);
    vi.advanceTimersByTime(50);
    const advanced = adapter.getSnapshot().squads.filter((squad) => squad.selected);
    expect(advanced[0]!.gridX).toBeGreaterThan(44);
    expect(advanced[1]!.gridX).toBeGreaterThan(45);
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
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 46.5, y: 49.25 });
    expect(adapter.getSnapshot().moveOrder?.destination).toEqual({ x: 46.5, y: 49.25 });
    vi.advanceTimersByTime(50);
    const alpha = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha');
    expect(alpha?.gridX).toBeGreaterThan(44);
    expect(alpha?.gridY).toBeGreaterThan(47);
    adapter.destroy();
    vi.useRealTimers();
  });
  it('adds a slower selectable bomber and routes around asteroids', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    const gamma = adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-gamma');
    expect(gamma?.unitType).toBe('bomber');
    adapter.dispatch({ type: 'select-squad', squadId: 'blue-gamma' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-gamma', x: 50, y: 46 });
    expect(adapter.getSnapshot().moveOrder).toBeNull();
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-gamma', x: 44, y: 50 });
    vi.advanceTimersByTime(50);
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-gamma')?.gridX).toBeCloseTo(42.1);
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
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-beta', x: 45, y: 49 });
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-beta')?.attackTargetId).toBeNull();
    adapter.destroy();
    vi.useRealTimers();
  });

  it('advances movement by elapsed time when a timer callback is delayed', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    try {
      adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 47, y: 47 });
      vi.setSystemTime(Date.now() + 450);
      vi.advanceTimersByTime(50);
      expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha')?.gridX).toBeCloseTo(46);
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
      adapter.dispatch({ type: 'move-selected', x: 53, y: 47 });
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
      adapter.dispatch({ type: 'move-selected', x: 54.76, y: 46.07 });
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
});
