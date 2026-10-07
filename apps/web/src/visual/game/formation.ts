import { FORMATIONS, planFormation, type FormationKind } from '@impulso/sim';
import { sectorSurface } from '../map/sector-map';

export const DEFAULT_FORMATION: FormationKind = 'box';
const STORAGE_KEY = 'impulso.formation';

/** The player's last formation survives reloads; storage may be unavailable (private window). */
export function readStoredFormation(): FormationKind {
  try {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    return (FORMATIONS as readonly string[]).includes(stored ?? '') ? stored as FormationKind : DEFAULT_FORMATION;
  } catch { return DEFAULT_FORMATION; }
}

export function storeFormation(formation: FormationKind): void {
  try { globalThis.localStorage?.setItem(STORAGE_KEY, formation); } catch { /* preference only */ }
}

export function nextFormation(formation: FormationKind): FormationKind {
  return FORMATIONS[(FORMATIONS.indexOf(formation) + 1) % FORMATIONS.length]!;
}

/** The same seats the server will assign (minus its reachability check), for previews and prediction. */
export function formationSeats(ships: readonly { id: string; x: number; y: number }[], center: { x: number; y: number }, formation: FormationKind) {
  const cells = ships.map((ship) => ({ id: ship.id, x: Math.round(ship.x), y: Math.round(ship.y) }));
  return planFormation(cells, center, formation, {
    open: (cell) => cell.x >= 0 && cell.y >= 0 && cell.x < sectorSurface.width && cell.y < sectorSurface.height
      && sectorSurface.walkable[cell.y * sectorSurface.width + cell.x] === true,
  });
}
