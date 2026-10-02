import { defineMapSpec } from './types.js';
import { SECTOR_01 } from '../mapas/sector-01.js';

const SIDE = 72;
const CELLS = SIDE * SIDE;

/** Gameplay metadata aligned with the current 72×72, 72 px Tiled artwork.
 * The artwork only declares terrain, so no collision or occlusion is inferred from its GIDs.
 */
export const BATTLEFIELD_MAP = defineMapSpec({
  id: 'battlefield', version: 1, width: SIDE, height: SIDE, cellSize: 72,
  bases: { p1: { x: 8, y: 63 }, p2: { x: 63, y: 8 } },
  objectives: [
    { id: 'metal-1', kind: 'metal', cell: { x: 24, y: 48 }, guardianId: 'metal-guardian-1', guardianCell: { x: 24, y: 48 } },
    { id: 'metal-2', kind: 'metal', cell: { x: 48, y: 24 }, guardianId: 'metal-guardian-2', guardianCell: { x: 48, y: 24 } },
    { id: 'core', kind: 'core', cell: { x: 36, y: 36 }, guardianId: 'core-guardian', guardianCell: { x: 36, y: 36 } },
  ],
  walkable: Array<boolean>(CELLS).fill(true),
  opaque: Array<boolean>(CELLS).fill(false),
});

/** Static catalog entry shared with the Sector 01 Tiled presentation. */
export const SECTOR_01_BATTLEFIELD_MAP = defineMapSpec({
  id: 'sector-01', version: 1, width: SECTOR_01.width, height: SECTOR_01.height, cellSize: 64,
  bases: SECTOR_01.bases,
  objectives: [
    ...SECTOR_01.metals.map((cell, index) => ({
      id: `metal-${index + 1}`,
      kind: 'metal' as const,
      cell,
      guardianId: `metal-${index + 1}-guardian`,
      guardianCell: cell,
    })),
    {
      id: 'core', kind: 'core' as const, cell: SECTOR_01.core,
      guardianId: 'core-guardian', guardianCell: SECTOR_01.core,
    },
  ],
  walkable: [...SECTOR_01.walkable],
  opaque: SECTOR_01.walkable.map((walkable) => !walkable),
  level: [...SECTOR_01.level],
  ramp: [...SECTOR_01.ramp],
});
