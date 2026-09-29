import { defineMapSpec } from './types.js';

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
