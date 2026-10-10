import { TILE_HEIGHT, type TiledObject, type TiledSector, type TileLayer, type Tileset } from './sector-map';

/** How the nexus is shown: the map's own pillar and shield art, or a top-down disc drawn by the scene. */
export type NexusStyle = 'pillar' | 'disc';
export const NEXUS_STYLE: NexusStyle = 'pillar';

/**
 * Whether the scene draws the top-down nexus disc (the `nexus-core-top-*` sprite) over the core cell.
 * With the pillar style the map's pillar and shield already show the nexus, so the scene must neither
 * create nor show that sprite: it keeps only the ring around the core and its capture progress.
 */
export function drawsNexusDisc(style: NexusStyle = NEXUS_STYLE): boolean {
  return style === 'disc';
}

export interface DrawableMapObject {
  layer: TileLayer;
  object: TiledObject;
  /** Play the tile's Tiled animation. Only far-background objects that declare one do. */
  animate: boolean;
  /** Index of the object inside `layer.objects`, which sets its draw order on flat layers. */
  order: number;
  /** Collection tileset holding the object's image, and the tile id inside it. */
  tileset: Tileset;
  tile: number;
}

/** Tiled stores flip flags in the top bits of every gid. */
const GID_MASK = 0x1fffffff;
/** Robots are animated by the robot effects, not drawn as static art. */
const ROBOT_LAYER = 'robots';
/** Written by scripts/obstaculos-tmx.ts so the editor shows the obstacles; the game draws them from the simulation. */
const OBSTACLE_PREVIEW_LAYER = 'obstaculos-vista';
/** The far background behind the terrain: the only layer whose objects may animate. */
const SKY_LAYER = 'fondo-espacio';
/** Emblems painted on the floor. */
const EMBLEM_LAYER = 'logos';
/** The live, owner-coloured bases replace these oversized Tiled placeholders. */
const TILED_BASES = new Set(['base_jugador', 'base_enemiga']);
/** The pillar nexus art; a disc nexus is drawn by the scene instead. */
const NEXUS_ART = new Set(['pilar', 'escudo']);
/** A base emblem stays only within this many cells (Chebyshev) of one of the bases of the surface. */
const BASE_EMBLEM = 'logo_stellar_base';
const BASE_EMBLEM_REACH = 8;

/** Object positions are in tile-height pixels along both isometric axes. */
export function objectCell(object: Pick<TiledObject, 'x' | 'y'>): { x: number; y: number } {
  return { x: object.x / TILE_HEIGHT, y: object.y / TILE_HEIGHT };
}

/**
 * Tile objects of the map's object layers the scene draws as static art, in layer and object order:
 * bases, robots, the obstacle preview and (for a disc nexus) the pillar and shield are left to their own
 * drawing; base emblems far from both bases are dropped.
 */
export function drawableMapObjects(
  map: TiledSector,
  surface: { bases: { p1: { x: number; y: number }; p2: { x: number; y: number } } },
  options: { nexusStyle: NexusStyle } = { nexusStyle: NEXUS_STYLE },
): DrawableMapObject[] {
  const drawn: DrawableMapObject[] = [];
  const bases = [surface.bases.p1, surface.bases.p2];
  for (const layer of map.layers) {
    if (!layer.visible || !layer.objects || layer.name === ROBOT_LAYER || layer.name === OBSTACLE_PREVIEW_LAYER) continue;
    for (const [order, object] of layer.objects.entries()) {
      if (!object.gid || object.visible === false) continue;
      const gid = object.gid & GID_MASK;
      const tileset = [...map.tilesets].reverse().find((set) => set.firstgid <= gid);
      // A strip tileset has no per-tile texture to draw an object with.
      if (!tileset || tileset.image) continue;
      const tile = gid - tileset.firstgid;
      const art = tileset.tiles?.find((candidate) => candidate.id === tile);
      if (!art?.image) continue;
      const names = [object.name ?? '', art.image.split('/').pop()!.replace(/\.png$/i, '')];
      if (names.some((name) => TILED_BASES.has(name))) continue;
      if (options.nexusStyle === 'disc' && names.some((name) => NEXUS_ART.has(name))) continue;
      if (layer.name === EMBLEM_LAYER && object.name === BASE_EMBLEM) {
        const cell = objectCell(object);
        if (bases.every((base) => Math.max(Math.abs(cell.x - base.x), Math.abs(cell.y - base.y)) > BASE_EMBLEM_REACH)) continue;
      }
      drawn.push({ layer, object, animate: layer.name === SKY_LAYER && !!art.animation?.length, order, tileset, tile });
    }
  }
  return drawn;
}
