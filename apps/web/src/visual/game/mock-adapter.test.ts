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

  it('moves the selected allied squad through the route and rejects occupied destinations', () => {
    vi.useFakeTimers();
    const adapter = createMockGameplayAdapter();
    adapter.dispatch({ type: 'set-action', action: 'move' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 35, y: 35 });
    expect(adapter.getSnapshot().moveOrder?.route).toEqual([
      { x: 32, y: 35 }, { x: 33, y: 35 }, { x: 34, y: 35 }, { x: 35, y: 35 },
    ]);
    expect(adapter.getSnapshot().activeAction).toBeNull();
    adapter.dispatch({ type: 'set-action', action: 'move' });
    adapter.dispatch({ type: 'move-squad', squadId: 'blue-alpha', x: 33, y: 37 });
    expect(adapter.getSnapshot().moveOrder?.destination).toEqual({ x: 35, y: 35 });
    adapter.dispatch({ type: 'move-squad', squadId: 'red-sigma', x: 50, y: 50 });
    expect(adapter.getSnapshot().moveOrder?.squadId).toBe('blue-alpha');
    vi.advanceTimersByTime(720);
    expect(adapter.getSnapshot().squads.find((squad) => squad.id === 'blue-alpha')).toMatchObject({ gridX: 35, gridY: 35, status: 'idle' });
    expect(adapter.getSnapshot().moveOrder).toBeNull();
    adapter.destroy();
    vi.useRealTimers();
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
