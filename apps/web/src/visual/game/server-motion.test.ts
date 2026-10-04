import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PlayerView } from '@impulso/state';
import { createServerGameplayAdapter } from './server-adapter';

const { handlers, leave } = vi.hoisted(() => ({ handlers: new Map<string, (view: PlayerView) => void>(), leave: vi.fn() }));
vi.mock('@colyseus/sdk', () => ({ Client: class {
  async create() { return { onMessage: (name: string, handler: (view: PlayerView) => void) => handlers.set(name, handler),
    onLeave: vi.fn(), leave, send: vi.fn() }; }
} }));

function view(x: number, y: number, tick: number): PlayerView {
  return { schemaVersion: 1, mode: 'training', tick, playerId: 'p1', width: 29, height: 29, obstacles: [],
    rules: { tickRate: 10, moveEveryTicks: 6, attackEveryTicks: 10, visionRadius: 4, captureRadius: 1,
      nodeCaptureTicks: 30, coreOpenTick: 1200, coreCaptureTicks: 300 },
    players: { p1: { id: 'p1', base: { x: 3, y: 3 }, metal: 6 }, p2: { id: 'p2', base: { x: 25, y: 25 } } },
    squads: [{ id: 'ship', ownerId: 'p1', kind: 'interceptor', x, y, hp: 120, maxHp: 120, damage: 12 }],
    guardians: [], nodes: [], visibleCells: [], winner: null,
    core: { id: 'core', guardianId: 'g', x: 14, y: 14, open: false, progress: { p1: 0, p2: 0 } } };
}

afterEach(() => { handlers.clear(); vi.useRealTimers(); });

describe('server movement presentation', () => {
  it('passes authoritative shots and reload through to the renderer', async () => {
    const adapter = createServerGameplayAdapter('http://localhost');
    await Promise.resolve();
    try {
      const current = view(3, 3, 7);
      current.squads[0]!.attackCooldown = { remainingTicks: 3, durationTicks: 5 };
      current.squads[0]!.lastShot = { tick: 5, from: { x: 3, y: 3 }, to: { x: 4, y: 3 }, splashRadius: 0 };
      handlers.get('view')!(current);
      expect(adapter.getSnapshot()).toMatchObject({ tickRate: 10, squads: [{
        attackCooldown: { remainingTicks: 3, durationTicks: 5 }, lastShot: current.squads[0]!.lastShot,
      }] });
    } finally { adapter.destroy(); }
  });
  it('uses the full cadence for a diagonal step and does not restart on unchanged views', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    const adapter = createServerGameplayAdapter('http://localhost');
    await Promise.resolve();
    try {
      handlers.get('view')!(view(3, 3, 0));
      handlers.get('view')!(view(4, 4, 6));
      vi.advanceTimersByTime(200);
      const first = adapter.getSnapshot().squads[0]!;
      expect(first.gridX).toBeGreaterThan(3.3);
      expect(first.gridX).toBeLessThan(3.35);
      handlers.get('view')!(view(4, 4, 8));
      vi.advanceTimersByTime(300);
      const second = adapter.getSnapshot().squads[0]!;
      expect(second.gridX).toBeGreaterThan(3.8);
      expect(second.gridX).toBeLessThan(3.85);
      expect(second.gridX).toBe(second.gridY);
      vi.advanceTimersByTime(120);
      expect(adapter.getSnapshot().squads[0]).toMatchObject({ gridX: 4, gridY: 4 });
    } finally { adapter.destroy(); }
    expect(vi.getTimerCount()).toBe(0);
  });
});
