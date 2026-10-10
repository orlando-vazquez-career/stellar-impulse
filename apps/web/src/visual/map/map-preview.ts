import { SECTOR_RULES, TRAINING_MAPS, type PlayerId, type TrainingMapId } from '@impulso/sim';
import { projectCellOn, projectedBoundsOn } from '../game/phaser/isometric';

/** A projected point of the preview, in world pixels measured from the top-left corner of the map's box. */
export interface PreviewPoint { x: number; y: number }
/** An objective and the cells around it that count as its capture area. */
export interface PreviewArea extends PreviewPoint { radius: number }

/** What the lobby draws of a map: the battlefield's own projection, without selecting the map. */
export interface MapPreview {
  id: TrainingMapId;
  /** Projected size of the whole map, in world pixels. Every point below lies inside it. */
  width: number;
  height: number;
  /** Centres of the cells ships can cross. */
  walkable: PreviewPoint[];
  bases: { p1: PreviewPoint; p2: PreviewPoint };
  core: PreviewArea;
  metals: PreviewArea[];
  captures: PreviewArea[];
  stations: PreviewArea[];
}

const previews = new Map<TrainingMapId, MapPreview>();

/** The preview of a map, built once per id. It reads TRAINING_MAPS directly: the active map never changes. */
export function buildMapPreview(id: TrainingMapId): MapPreview {
  const cached = previews.get(id);
  if (cached) return cached;
  const map = TRAINING_MAPS[id];
  const bounds = projectedBoundsOn(map.width, map.height);
  const point = (cell: { x: number; y: number }): PreviewPoint => {
    const projected = projectCellOn(map.width, map.height, cell.x, cell.y);
    return { x: projected.x - bounds.x, y: projected.y - bounds.y };
  };
  // Same fallback as the simulation: an objective without its own radius uses the rules' capture radius.
  const area = (cell: { x: number; y: number; radius?: number }): PreviewArea => ({ ...point(cell), radius: cell.radius ?? SECTOR_RULES.captureRadius });
  const preview: MapPreview = {
    id,
    width: bounds.width,
    height: bounds.height,
    walkable: map.walkable.flatMap((open, index) => open ? [point({ x: index % map.width, y: Math.floor(index / map.width) })] : []),
    bases: { p1: point(map.bases.p1), p2: point(map.bases.p2) },
    core: area(map.core),
    metals: map.metals.map(area),
    captures: map.captures.map(area),
    stations: (map.stations ?? []).map(area),
  };
  previews.set(id, preview);
  return preview;
}

/**
 * Fleet colour of each seat for the player sitting in `self`. As in the match, their own fleet is always blue and
 * the rival's red, so a guest in p2 sees their base blue here too.
 */
export function seatFactions(self: PlayerId = 'p1'): Record<PlayerId, 'blue' | 'red'> {
  return self === 'p2' ? { p1: 'red', p2: 'blue' } : { p1: 'blue', p2: 'red' };
}

/**
 * Scale and placement that fit the whole preview in a `width`×`height` canvas, centred, `margin` pixels from
 * every edge. A canvas with no room gets a zero scale.
 */
export function fitMapPreview(preview: MapPreview, width: number, height: number, margin: number) {
  const scale = Math.max(0, Math.min((width - margin * 2) / preview.width, (height - margin * 2) / preview.height));
  const left = (width - preview.width * scale) / 2;
  const top = (height - preview.height * scale) / 2;
  return { scale, place: (point: PreviewPoint): PreviewPoint => ({ x: left + point.x * scale, y: top + point.y * scale }) };
}
