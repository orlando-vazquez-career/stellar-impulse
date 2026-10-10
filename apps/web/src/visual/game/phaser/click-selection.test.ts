import { describe, expect, it, vi } from 'vitest';
import { clickSelection } from './click-selection';

describe('what a left click on the battlefield selects', () => {
  it('selects the base under the cursor when no ship is there', () => {
    expect(clickSelection({ dragged: false, clickedId: null, doubleClick: false, baseAt: () => 'own' })).toEqual({ kind: 'base', base: 'own' });
    expect(clickSelection({ dragged: false, clickedId: null, doubleClick: false, baseAt: () => 'enemy' })).toEqual({ kind: 'base', base: 'enemy' });
  });

  it('lets a ship over a base win, without looking for the base', () => {
    const baseAt = vi.fn(() => 'own' as const);
    expect(clickSelection({ dragged: false, clickedId: 'blue-1', doubleClick: false, baseAt })).toEqual({ kind: 'ship', shipId: 'blue-1' });
    expect(baseAt).not.toHaveBeenCalled();
  });

  it('clears the selection on open ground', () => {
    expect(clickSelection({ dragged: false, clickedId: null, doubleClick: false, baseAt: () => null })).toEqual({ kind: 'clear' });
  });

  it('never picks a base with the drag box', () => {
    const baseAt = vi.fn(() => 'own' as const);
    expect(clickSelection({ dragged: true, clickedId: null, doubleClick: false, baseAt })).toEqual({ kind: 'box' });
    expect(clickSelection({ dragged: true, clickedId: 'blue-1', doubleClick: true, baseAt })).toEqual({ kind: 'box' });
    expect(baseAt).not.toHaveBeenCalled();
  });

  it('selects the whole class on a double click on a ship', () => {
    const baseAt = vi.fn(() => 'own' as const);
    expect(clickSelection({ dragged: false, clickedId: 'blue-1', doubleClick: true, baseAt })).toEqual({ kind: 'class', shipId: 'blue-1' });
    expect(baseAt).not.toHaveBeenCalled();
  });
});
