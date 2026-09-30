import { describe, expect, it } from 'vitest';
import { findPath } from '../maps/pathfinding.js';
import { applyHeightAdvantage, canCrossHeight } from './alturas.js';

const flat = { width: 2, level: [0, 0], ramp: [null, null] as const };

describe('height rules', () => {
  it('crosses a flat step and a ramp, and refuses a bare cliff', () => {
    expect(canCrossHeight({ ...flat, from: 0, to: 1 })).toBe(true);
    expect(canCrossHeight({ width: 2, level: [0, 1], ramp: ['x+', null], from: 0, to: 1 })).toBe(true);
    expect(canCrossHeight({ width: 2, level: [0, 1], ramp: ['x+', null], from: 1, to: 0 })).toBe(true);
    expect(canCrossHeight({ width: 2, level: [0, 1], ramp: [null, null], from: 0, to: 1 })).toBe(false);
    expect(canCrossHeight({ width: 2, level: [0, 1], ramp: ['y+', null], from: 0, to: 1 })).toBe(false);
  });

  it('adds the height bonus only when the attacker stands higher', () => {
    expect(applyHeightAdvantage({ damage: 12, attackerLevel: 1, defenderLevel: 0 })).toBe(15);
    expect(applyHeightAdvantage({ damage: 12, attackerLevel: 0, defenderLevel: 1 })).toBe(12);
    expect(applyHeightAdvantage({ damage: 12, attackerLevel: 1, defenderLevel: 1 })).toBe(12);
  });

  it('keeps the existing orthogonal search and closes cliffs inside it', () => {
    const open = { width: 2, height: 1, walkable: [true, true], level: [0, 0], ramp: [null, null] };
    expect(findPath(open, { x: 0, y: 0 }, { x: 1, y: 0 }).status).toBe('found');
    const cliff = { ...open, level: [0, 1] };
    expect(findPath(cliff, { x: 0, y: 0 }, { x: 1, y: 0 }).status).toBe('unreachable');
    expect(findPath({ ...cliff, ramp: ['x+', null] }, { x: 0, y: 0 }, { x: 1, y: 0 }).status).toBe('found');
    expect(findPath({ width: 2, height: 1, walkable: [true, true] }, { x: 0, y: 0 }, { x: 1, y: 0 }).status).toBe('found');
  });
});
