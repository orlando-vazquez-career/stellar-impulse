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
  it('glides a diagonal step without restarting on unchanged views and settles on the cell', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    const adapter = createServerGameplayAdapter('http://localhost');
    await Promise.resolve();
    try {
      handlers.get('view')!(view(3, 3, 0));
      handlers.get('view')!(view(4, 4, 6));
      vi.advanceTimersByTime(200);
      const first = adapter.getSnapshot().squads[0]!;
      expect(first.gridX).toBeGreaterThan(3);
      expect(first.gridX).toBe(first.gridY);
      // A view without movement must not restart the glide from the start.
      handlers.get('view')!(view(4, 4, 8));
      vi.advanceTimersByTime(300);
      const second = adapter.getSnapshot().squads[0]!;
      expect(second.gridX).toBeGreaterThan(first.gridX);
      expect(second.gridX).toBe(second.gridY);
      vi.advanceTimersByTime(1500);
      expect(adapter.getSnapshot().squads[0]).toMatchObject({ gridX: 4, gridY: 4 });
    } finally { adapter.destroy(); }
    expect(vi.getTimerCount()).toBe(0);
  });
  it('keeps a long route moving at a steady pace despite update jitter', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
    const adapter = createServerGameplayAdapter('http://localhost');
    await Promise.resolve();
    try {
      // An 8-way route like the server's: diagonal and straight steps mixed, one per 0.6 s.
      const path = [[3, 3], [4, 4], [5, 4], [6, 5], [7, 5], [8, 6], [9, 6], [10, 7], [11, 7], [12, 8], [13, 8]];
      const jitter = [0, 35, 10, 60, 5, 45, 20, 0, 55, 15, 30, 50, 8, 40];
      const samples: [number, number][] = [];
      for (let ms = 0; ms <= 7000; ms += 4) {
        if (ms % 100 === jitter[(ms / 100) % jitter.length]) {
          const tick = Math.floor(ms / 100);
          const step = path[Math.min(path.length - 1, Math.floor(tick / 6))]!;
          handlers.get('view')!(view(step[0]!, step[1]!, tick));
        }
        vi.advanceTimersByTime(4);
        if (ms % 16 === 0) { const ship = adapter.getSnapshot().squads[0]!; samples.push([ship.gridX, ship.gridY]); }
      }
      const speeds = samples.slice(1).map((point, index) => Math.hypot(point[0] - samples[index]![0], point[1] - samples[index]![1]) / 0.016);
      // Skip the first half second of acceleration; stop where the server route ends.
      const cruise = speeds.slice(speeds.findIndex((speed) => speed > 0) + 30, Math.floor(6000 / 16));
      const mean = cruise.reduce((sum, speed) => sum + speed, 0) / cruise.length;
      const spread = Math.sqrt(cruise.reduce((sum, speed) => sum + (speed - mean) ** 2, 0) / cruise.length) / mean;
      expect(cruise.every((speed) => speed > 0)).toBe(true);
      expect(spread).toBeLessThan(0.2);
      expect(samples.at(-1)).toEqual([13, 8]);
    } finally { adapter.destroy(); }
  });
});
