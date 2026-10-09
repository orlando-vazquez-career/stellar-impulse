import { describe, expect, it } from 'vitest';
import {
  assignControlGroup,
  controlGroupShortcut,
  focusSelectedSquads,
  productionKindForKey,
  recallControlGroup,
  type ControlGroupSquad,
} from './control-shortcuts';

const units: ControlGroupSquad[] = [
  { id: 'blue-a', owner: 'blue', visible: true, healthPercent: 100, gridX: 2, gridY: 4 },
  { id: 'blue-b', owner: 'blue', visible: true, healthPercent: 50, gridX: 6, gridY: 8 },
  { id: 'blue-dead', owner: 'blue', visible: true, healthPercent: 0, gridX: 10, gridY: 10 },
  { id: 'blue-hidden', owner: 'blue', visible: false, healthPercent: 100, gridX: 20, gridY: 20 },
  { id: 'red-a', owner: 'red', visible: true, healthPercent: 100, gridX: 30, gridY: 30 },
];

const noModifiers = { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false };

describe('gameplay shortcuts', () => {
  it('maps QERT to the four production types without colliding with control groups', () => {
    expect(['Q', 'E', 'R', 'T'].map(productionKindForKey)).toEqual([
      'interceptor', 'frigate', 'bomber', 'explorer',
    ]);
    expect(productionKindForKey('q')).toBe('interceptor');
    expect(productionKindForKey('1')).toBeNull();
  });

  it('distinguishes assigning a control group from recalling it', () => {
    expect(controlGroupShortcut('3', { ...noModifiers, ctrlKey: true })).toEqual({ group: 3, mode: 'assign' });
    expect(controlGroupShortcut('3', noModifiers)).toEqual({ group: 3, mode: 'recall' });
    expect(controlGroupShortcut('3', { ...noModifiers, shiftKey: true })).toBeNull();
    expect(controlGroupShortcut('0', noModifiers)).toBeNull();
  });

  it('assigns only selected living, visible, friendly squads', () => {
    const groups = assignControlGroup({}, 2, ['blue-a', 'red-a', 'blue-dead', 'blue-hidden'], units);
    expect(groups[2]).toEqual(['blue-a']);
  });

  it('filters destroyed, hidden, and no-longer-friendly squads when recalling', () => {
    const groups = assignControlGroup({}, 2, ['blue-a', 'blue-b'], units);
    const current = units.map((unit) => unit.id === 'blue-a' ? { ...unit, healthPercent: 0 }
      : unit.id === 'blue-b' ? { ...unit, visible: false } : unit);
    expect(recallControlGroup(groups, 2, current)).toEqual([]);
  });

  it('focuses the centroid of selected living friendly squads only', () => {
    expect(focusSelectedSquads(units, ['blue-a', 'blue-b', 'red-a', 'blue-dead'])).toEqual({ x: 4, y: 6 });
    expect(focusSelectedSquads(units, ['red-a'])).toBeNull();
  });
});
