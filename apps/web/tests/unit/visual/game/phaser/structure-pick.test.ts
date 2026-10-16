import { afterAll, describe, expect, it } from 'vitest';
import { BASE_PICK_HALF_HEIGHT, BASE_PICK_HALF_WIDTH, pickBase, pickStation } from '../../../../../src/visual/game/phaser/structure-pick';
import { cellToIso } from '../../../../../src/visual/game/phaser/isometric';
import { selectMap, sectorSurface } from '../../../../../src/visual/map/sector-map';

/** A flat projection keeps the ellipse checks readable: cell (x, y) sits at (100x, 100y). */
const flat = (x: number, y: number) => ({ x: x * 100, y: y * 100 });
const own = { x: 2, y: 2 };
const enemy = { x: 8, y: 2 };

describe('pickBase', () => {
  it('uses a 52x30 px ellipse around each base', () => {
    expect(BASE_PICK_HALF_WIDTH).toBe(52);
    expect(BASE_PICK_HALF_HEIGHT).toBe(30);
  });

  it('picks the base whose ellipse holds the point', () => {
    expect(pickBase({ x: 800, y: 200 }, { own, enemy }, flat)).toBe('enemy');
    expect(pickBase({ x: 200, y: 200 }, { own, enemy }, flat)).toBe('own');
    expect(pickBase({ x: 800 + 51, y: 200 }, { own, enemy }, flat)).toBe('enemy');
    expect(pickBase({ x: 800, y: 200 - 29 }, { own, enemy }, flat)).toBe('enemy');
    expect(pickBase({ x: 200 - 51, y: 200 }, { own, enemy }, flat)).toBe('own');
  });

  it('misses outside both ellipses, also inside their bounding box', () => {
    expect(pickBase({ x: 500, y: 200 }, { own, enemy }, flat)).toBeNull();
    expect(pickBase({ x: 800 + 53, y: 200 }, { own, enemy }, flat)).toBeNull();
    expect(pickBase({ x: 800, y: 200 + 31 }, { own, enemy }, flat)).toBeNull();
    // (40/52)² + (25/30)² > 1: a corner of the box, not the ellipse.
    expect(pickBase({ x: 800 + 40, y: 200 + 25 }, { own, enemy }, flat)).toBeNull();
  });

  it('is null without an enemy base where the enemy would be, and with no bases at all', () => {
    expect(pickBase({ x: 800, y: 200 }, { own }, flat)).toBeNull();
    expect(pickBase({ x: 800, y: 200 }, {}, flat)).toBeNull();
  });

  it('still picks the own base while the enemy one is hidden', () => {
    expect(pickBase({ x: 200, y: 200 }, { own }, flat)).toBe('own');
  });

  it('prefers the nearer centre when the two ellipses overlap', () => {
    const close = { x: 2.6, y: 2 };
    expect(pickBase({ x: 215, y: 200 }, { own, enemy: close }, flat)).toBe('own');
    expect(pickBase({ x: 250, y: 200 }, { own, enemy: close }, flat)).toBe('enemy');
  });

  it('breaks an exact tie in favour of the enemy base, the attack order', () => {
    const adjacent = { x: 3, y: 2 };
    // (250, 200) is 50 px from both centres: the same distance inside both ellipses.
    expect(pickBase({ x: 250, y: 200 }, { own, enemy: adjacent }, flat)).toBe('enemy');
    expect(pickBase({ x: 250, y: 200 }, { own: adjacent, enemy: own }, flat)).toBe('enemy');
  });

  describe('on a real map with the isometric projection', () => {
    afterAll(() => selectMap('espiral'));

    it('picks the own base when the player holds bases.p2', () => {
      selectMap('espiral-2');
      const mine = sectorSurface.bases.p2;
      const theirs = sectorSurface.bases.p1;
      const onMine = cellToIso(mine.x, mine.y);
      const onTheirs = cellToIso(theirs.x, theirs.y);
      expect(pickBase(onMine, { own: mine, enemy: theirs })).toBe('own');
      expect(pickBase({ x: onTheirs.x + 20, y: onTheirs.y - 10 }, { own: mine, enemy: theirs })).toBe('enemy');
      expect(pickBase({ x: onTheirs.x, y: onTheirs.y + 40 }, { own: mine, enemy: theirs })).toBeNull();
      expect(pickBase(onTheirs, { own: mine })).toBeNull();
    });
  });
});

describe('pickStation', () => {
  it('picks a visible station inside its dock and misses outside it', () => {
    const stations = [{ id: 'station-1', x: 2, y: 2 }];
    expect(pickStation({ x: 200, y: 209 }, stations, flat)).toBe('station-1');
    expect(pickStation({ x: 200 + 43, y: 209 }, stations, flat)).toBeNull();
    expect(pickStation({ x: 200, y: 209 + 25 }, stations, flat)).toBeNull();
  });

  it('chooses the closest station when dock hit areas overlap', () => {
    const stations = [{ id: 'first', x: 2, y: 2 }, { id: 'second', x: 2.5, y: 2 }];
    expect(pickStation({ x: 240, y: 209 }, stations, flat)).toBe('second');
  });
});
