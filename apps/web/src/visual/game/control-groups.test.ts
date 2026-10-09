import { describe, expect, it } from 'vitest';
import { addToGroup, focusCell, groupMembers, pruneGroups, setGroup } from './control-groups';
import type { SquadViewModel } from './model';

const ship = (id: string, gridX: number, gridY: number, extra: Partial<SquadViewModel> = {}): SquadViewModel => ({
  id, callSign: id, owner: 'blue', unitType: 'interceptor', gridX, gridY, healthPercent: 100, selected: false, visible: true,
  composition: { interceptors: 1, frigates: 0 }, status: 'idle', ...extra,
});

describe('control groups', () => {
  it('Ctrl+number replaces the squad and Shift+number adds to it', () => {
    let groups = setGroup({}, 1, ['a', 'b']);
    groups = addToGroup(groups, 1, ['b', 'c']);
    expect(groups[1]).toEqual(['a', 'b', 'c']);
    groups = setGroup(groups, 1, ['d']);
    expect(groups[1]).toEqual(['d']);
    expect(setGroup(groups, 1, [])[1]).toBeUndefined();
  });

  it('a ship can belong to several squads', () => {
    const groups = setGroup(setGroup({}, 1, ['a', 'b']), 2, ['b']);
    expect(groups[1]).toContain('b');
    expect(groups[2]).toEqual(['b']);
  });

  it('only living own ships answer to a squad key, and lost ones leave', () => {
    const squads = [ship('a', 1, 1), ship('b', 2, 2, { healthPercent: 0, status: 'destroyed' }), ship('r', 3, 3, { owner: 'red' })];
    const groups = setGroup({}, 3, ['a', 'b', 'r', 'gone']);
    expect(groupMembers(groups, 3, squads).map((squad) => squad.id)).toEqual(['a']);
    expect(pruneGroups(groups, squads)[3]).toEqual(['a']);
    expect(pruneGroups(setGroup({}, 4, ['b']), squads)).toEqual({});
  });

  it('pruning without losses keeps the same object, so React does not re-render', () => {
    const groups = setGroup({}, 1, ['a']);
    expect(pruneGroups(groups, [ship('a', 0, 0)])).toBe(groups);
  });

  it('centres on the ship closest to the middle of the group', () => {
    expect(focusCell([])).toBeNull();
    expect(focusCell([ship('a', 2, 2), ship('b', 4, 6)])).toEqual({ x: 3, y: 4 });
    // Middle (10, 10) is empty space between two clusters; the camera lands on the closest ship.
    expect(focusCell([ship('a', 0, 0), ship('b', 1, 0), ship('c', 19, 18), ship('d', 20, 22)])).toEqual({ x: 19, y: 18 });
  });
});
