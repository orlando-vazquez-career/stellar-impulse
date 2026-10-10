import { describe, expect, it } from 'vitest';
import { TRAINING_MAPS, type TrainingMapId } from '@impulso/sim';
import { previewLayout } from './map-preview';

describe('map preview layout', () => {
  it.each(Object.keys(TRAINING_MAPS) as TrainingMapId[])('keeps every cell of %s inside its box', (id) => {
    const surface = TRAINING_MAPS[id];
    const layout = previewLayout(surface, 480);
    for (const [x, y] of [[0, 0], [surface.width - 1, 0], [surface.width - 1, surface.height - 1], [0, surface.height - 1]] as const) {
      const point = layout.point(x, y);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(layout.width);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(layout.height);
    }
  });

  it('shows the player on the left and the rival on the right, as the match camera does', () => {
    const surface = TRAINING_MAPS.espiral;
    const layout = previewLayout(surface);
    expect(layout.point(surface.bases.p1.x, surface.bases.p1.y).x).toBeLessThan(layout.point(surface.bases.p2.x, surface.bases.p2.y).x);
  });
});
