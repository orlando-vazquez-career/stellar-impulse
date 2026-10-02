import { describe, expect, it } from 'vitest';
import type { BattlefieldView } from '@impulso/state';
import { battlefieldCommandsForIntent, mapBattlefieldView } from './network-adapter';

const view = (overrides: Partial<BattlefieldView> = {}): BattlefieldView => ({
  schemaVersion: 2,
  mode: 'battlefield',
  mapId: 'sector-01',
  mapVersion: 1,
  tick: 12,
  playerId: 'p1',
  width: 29,
  height: 29,
  rules: { tickRate: 10, moveEveryTicks: 3, attackEveryTicks: 10, visionRadius: 4, captureRadius: 1, nodeCaptureTicks: 30, coreOpenTick: 200, coreCaptureTicks: 80 },
  players: { p1: { id: 'p1', base: { x: 3, y: 25 }, metal: 4, lastSequence: 8 }, p2: { id: 'p2', base: { x: 25, y: 3 } } },
  squads: [{ id: 'p1-interceptor', ownerId: 'p1', kind: 'interceptor', x: 3, y: 25, hp: 120, maxHp: 120, damage: 12, target: { x: 5, y: 25 }, route: [{ x: 4, y: 25 }], attackTargetId: null }],
  guardians: [],
  nodes: [],
  core: { id: 'core', x: 14, y: 14, guardianId: 'core-guardian', open: false, progress: { p1: 0, p2: 0 } },
  visible: { encoding: 'bitset-lsb0', width: 29, height: 29, data: Array(Math.ceil(29 * 29 / 8)).fill(0) },
  explored: { encoding: 'bitset-lsb0', width: 29, height: 29, data: Array(Math.ceil(29 * 29 / 8)).fill(0) },
  winner: null,
  ...overrides,
});

describe('network gameplay adapter', () => {
  it('maps an authoritative battlefield view into the Phaser presentation model', () => {
    const snapshot = mapBattlefieldView(view());
    expect(snapshot.squads[0]).toMatchObject({
      id: 'p1-interceptor', owner: 'blue', gridX: 3, gridY: 25,
      status: 'moving', healthPercent: 100,
    });
    expect(snapshot.moveOrder).toMatchObject({ squadId: 'p1-interceptor', destination: { x: 5, y: 25 }, route: [{ x: 4, y: 25 }] });
    expect(snapshot.resources.metal).toBe(4);
  });

  it('turns presentation intents into authoritative group commands', () => {
    expect(battlefieldCommandsForIntent({ type: 'hold-selected' }, view(), 9)).toEqual([
      { seq: 9, type: 'stop', squadIds: ['p1-interceptor'] },
    ]);
    expect(battlefieldCommandsForIntent({ type: 'move-selected', x: 10.4, y: 11.6 }, view(), 10)).toEqual([
      { seq: 10, type: 'move_group', squadIds: ['p1-interceptor'], x: 10, y: 12 },
    ]);
    expect(battlefieldCommandsForIntent({ type: 'attack-selected', targetId: 'p2-interceptor' }, view(), 11)).toEqual([
      { seq: 11, type: 'attack_group', squadIds: ['p1-interceptor'], targetId: 'p2-interceptor' },
    ]);
  });
});