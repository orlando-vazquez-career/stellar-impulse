import { describe, expect, it, vi } from 'vitest';
import { clickSelection } from '../../../../../src/visual/game/phaser/click-selection';

describe('what a left click on the battlefield selects', () => {
  it('selects the base under the cursor when no ship is there', () => {
    expect(clickSelection({ dragged: false, clickedId: null, doubleClick: false, baseAt: () => 'own' })).toEqual({ kind: 'base', base: 'own' });
    expect(clickSelection({ dragged: false, clickedId: null, doubleClick: false, baseAt: () => 'enemy' })).toEqual({ kind: 'base', base: 'enemy' });
  });

  it('selects a station when no ship is under the cursor', () => {
    expect(clickSelection({ dragged: false, clickedId: null, doubleClick: false, stationAt: () => 'station-1', baseAt: () => 'own' }))
      .toEqual({ kind: 'station', stationId: 'station-1' });
  });

  it('lets a ship over a base win, without looking for the base', () => {
    const baseAt = vi.fn(() => 'own' as const);
    expect(clickSelection({ dragged: false, clickedId: 'blue-1', doubleClick: false, baseAt })).toEqual({ kind: 'ship', shipId: 'blue-1' });
    expect(baseAt).not.toHaveBeenCalled();
  });

  it('lets a ship over a station win, without looking for the station', () => {
    const stationAt = vi.fn(() => 'station-1');
    expect(clickSelection({ dragged: false, clickedId: 'blue-1', doubleClick: false, stationAt, baseAt: () => null }))
      .toEqual({ kind: 'ship', shipId: 'blue-1' });
    expect(stationAt).not.toHaveBeenCalled();
  });

  it('clears the selection on open ground', () => {
    expect(clickSelection({ dragged: false, clickedId: null, doubleClick: false, baseAt: () => null })).toEqual({ kind: 'clear' });
  });

  it('never picks a base with the drag box', () => {
    const baseAt = vi.fn(() => 'own' as const);
    const stationAt = vi.fn(() => 'station-1' as const);
    expect(clickSelection({ dragged: true, clickedId: null, doubleClick: false, stationAt, baseAt })).toEqual({ kind: 'box' });
    expect(clickSelection({ dragged: true, clickedId: 'blue-1', doubleClick: true, stationAt, baseAt })).toEqual({ kind: 'box' });
    expect(baseAt).not.toHaveBeenCalled();
    expect(stationAt).not.toHaveBeenCalled();
  });

  it('selects the whole class on a double click on a ship', () => {
    const baseAt = vi.fn(() => 'own' as const);
    expect(clickSelection({ dragged: false, clickedId: 'blue-1', doubleClick: true, baseAt })).toEqual({ kind: 'class', shipId: 'blue-1' });
    expect(baseAt).not.toHaveBeenCalled();
  });
});
