import Phaser from 'phaser';
import type { CameraView, CoreState, GameplayViewModel, SquadViewModel } from '../model';
import type { GridPoint } from './grid';
import { activeMapId, HIDDEN_LAYERS, mapImageUrl, planSectorMove, sectorMap, sectorSurface, TILE_WIDTH, type Tileset } from '../../map/sector-map';
import { cellToIso, isoToPoint, ISO_WORLD_HEIGHT, ISO_WORLD_WIDTH, TILE_HALF_HEIGHT, playerViewCenter, playerViewZoom, projectedWorldBounds } from './isometric';
import { WeaponEffects } from './weapon-effects';
import { DEFAULT_FORMATION, formationSeats } from '../formation';
import { SatelliteEffects } from './satellite-effects';
import { RobotEffects, ROBOT_LAYER } from './robot-effects';

/** Tiled stores flip flags in the top bits of every gid. */
const GID_MASK = 0x1fffffff;
/** Draw order: terrain layers, then node rings, then ships and map structures sorted by screen y, then overlays. */
const DEPTH = { layer: 10000, nodes: 90000, units: 100000, route: 200000, core: 200001, selection: 300000 } as const;
/** Multiplicative tint for tiles outside vision: dark, but the terrain stays readable. */
const FOG_TINT = 0x4a5566;
/** Layer written by scripts/obstaculos-tmx.ts so the editor shows the obstacles; never drawn in game. */
const OBSTACLE_PREVIEW_LAYER = 'obstaculos-vista';
/** Opening zoom over your own fleet. The wheel goes from ZOOM_MIN (wider view of the sector)
 * to ZOOM_MAX (close-up). The whole 96×96 map at once is unreadable and costly to draw. */
export const ZOOM_DEFAULT = 1.5;
export const ZOOM_MIN = 0.9;
export const ZOOM_MAX = 2.2;
/** Terrain is built and drawn in square blocks of this many cells, only while they are on screen. */
const CHUNK_CELLS = 8;
/** Pointer distance from a screen edge, in pixels, at which the camera starts to drift. */
const EDGE_ZONE = 56;
/** Top camera speed in screen pixels per second, and the seconds it takes to get there or to stop. */
const PAN_SPEED = 980;
const PAN_EASE = 0.11;
const ZOOM_EASE = 0.09;
/** Two clicks on the same ship within this window select its whole class on screen. */
const DOUBLE_CLICK_MS = 350;

const color = {
  background: 0x080e18,
  floor: 0x101a29,
  floorLight: 0x142135,
  floorDark: 0x0d1725,
  grid: 0x293a50,
  sector: 0x3f5570,
  blue: 0x36a9ff,
  blueLight: 0x83d4ff,
  red: 0xff4f64,
  redLight: 0xff9ba7,
  neutral: 0xf2b84b,
  neutralLight: 0xf7d774,
  core: 0xf7e77c,
  panel: 0x131d2d,
};

interface TerrainChunk {
  x0: number; y0: number; x1: number; y1: number;
  left: number; right: number; top: number; bottom: number;
  /** Null until the block first comes into view. */
  images: Phaser.GameObjects.Image[] | null;
  shown: boolean;
}

interface UnitVisual {
  container: Phaser.GameObjects.Container;
  selection: Phaser.GameObjects.Graphics;
  hull: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  hitFlash: Phaser.GameObjects.Graphics;
  health: Phaser.GameObjects.Rectangle;
  reloadBack: Phaser.GameObjects.Rectangle;
  reload: Phaser.GameObjects.Rectangle;
  cooldown?: SquadViewModel['attackCooldown'];
  lastShotTick: number;
  healthPercent: number;
  gridX: number;
  gridY: number;
  targetX: number;
  targetY: number;
  heading: number;
}

function coreColor(state: CoreState) {
  if (state === 'blue-capturing' || state === 'blue-controlled') return color.blue;
  if (state === 'red-capturing' || state === 'red-controlled') return color.red;
  if (state === 'contested') return 0xff9f43;
  return color.core;
}


function polygon(vertices: { x: number; y: number }[]) {
  return vertices.map(({ x, y }) => new Phaser.Math.Vector2(x, y));
}

export class MainScene extends Phaser.Scene {
  private snapshot: GameplayViewModel;
  private readonly onSelectSquads: (squadIds: string[]) => void;
  private readonly onMoveSelected: (x: number, y: number) => void;
  private readonly onAttackSelected: (targetId: string) => void;
  private readonly onCameraChange: (view: CameraView) => void;
  private readonly onReady: () => void;
  private terrain?: Phaser.GameObjects.Graphics;
  private route?: Phaser.GameObjects.Graphics;
  private attackRanges?:Phaser.GameObjects.Graphics;
  private showBaseRange=false;
  private selectionBox?: Phaser.GameObjects.Graphics;
  private core?: Phaser.GameObjects.Graphics;
  private nodeMarks?: Phaser.GameObjects.Graphics;
  private baseMarks?: Phaser.GameObjects.Graphics;
  /** Terrain images per cell, so fog can tint the real tile art instead of painting over it. */
  private tileImages: Phaser.GameObjects.Image[][] = [];
  private fogShown: boolean[] = [];
  private fogSource: boolean[] | null | undefined;
  private terrainLayers: { data: number[]; order: number }[] = [];
  private chunks: TerrainChunk[] = [];
  /** Flat ground tiles with no see-through pixels: whatever flat tile lies under one is never visible. */
  private readonly solidGround = new Set<number>();
  private readonly panVelocity = { x: 0, y: 0 };
  private zoomTarget = ZOOM_DEFAULT;
  private zoomAnchor: { x: number; y: number } | null = null;
  private rangeKey = '';
  private previewKey = '';
  private previewPath: GridPoint[] = [];
  private created = false;
  private weapons?: WeaponEffects;
  private satellites?: SatelliteEffects;
  private robots?: RobotEffects;
  private serverTickAt = 0;
  private readonly unitVisuals = new Map<string, UnitVisual>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private dragOrigin?: { x: number; y: number; scrollX: number; scrollY: number };
  private selectionDrag?: { start: { x: number; y: number }; current: { x: number; y: number }; clickedId: string | null };
  private lastClick: { id: string; at: number; group: boolean } | null = null;
  private hoverPoint: GridPoint | null = null;
  private lastCameraView = '';
  private pointerOnCanvas = false;

  constructor(
    snapshot: GameplayViewModel,
    onSelectSquads: (squadIds: string[]) => void,
    onMoveSelected: (x: number, y: number) => void,
    onAttackSelected: (targetId: string) => void,
    onCameraChange: (view: CameraView) => void,
    onReady: () => void,
    private readonly onError: (message: string) => void,
  ) {
    super({ key: 'MainScene' });
    this.snapshot = snapshot;
    this.onSelectSquads = onSelectSquads;
    this.onMoveSelected = onMoveSelected;
    this.onAttackSelected = onAttackSelected;
    this.onCameraChange = onCameraChange;
    this.onReady = onReady;
  }

  preload() {
    for (const tileset of sectorMap.tilesets) {
      const sheet = mapImageUrl(tileset.image);
      if (sheet) this.load.spritesheet(textureKey(tileset)!, sheet, { frameWidth: tileset.tilewidth, frameHeight: tileset.tileheight });
      for (const tile of tileset.tiles ?? []) {
        const url = mapImageUrl(tile.image);
        if (url) this.load.image(textureKey(tileset, tile.id)!, url);
      }
    }
    SatelliteEffects.preload(this);
    RobotEffects.preload(this);
  }

  create() {
    if (sectorMap.orientation !== 'isometric') {
      this.onError('El mapa del sector no tiene el tamaño esperado.');
      return;
    }
    this.scale.refresh();
    this.cameras.main.setBackgroundColor(color.background);
    // Margin so a base on the map edge can still be centred clear of the HUD panels.
    const bounds = projectedWorldBounds();
    const margin = 360;
    this.cameras.main.setBounds(bounds.x - margin, bounds.y - margin, bounds.width + margin * 2, bounds.height + margin * 2);
    this.terrain = this.add.graphics().setDepth(0);
    this.route = this.add.graphics().setDepth(DEPTH.route);
    this.attackRanges=this.add.graphics().setDepth(DEPTH.nodes+1);
    this.selectionBox = this.add.graphics().setScrollFactor(0).setDepth(DEPTH.selection);
    this.core = this.add.graphics().setDepth(DEPTH.core);
    this.nodeMarks = this.add.graphics().setDepth(DEPTH.nodes);
    this.baseMarks = this.add.graphics().setDepth(DEPTH.core);
    this.weapons = new WeaponEffects(this);
    this.satellites = new SatelliteEffects(this);
    this.robots = new RobotEffects(this);
    this.serverTickAt = this.time.now;

    this.drawTerrain();
    this.drawCore();
    this.renderSnapshot();
    this.configureInput();
    const canvas = this.game.canvas;
    const onPointerMove = (event: PointerEvent) => { this.pointerOnCanvas = event.target === canvas; };
    window.addEventListener('pointermove', onPointerMove);
    this.resetCamera();
    this.refreshCameraView();
    this.created = true;
    this.onReady();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshCameraView, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshCameraView, this);
      window.removeEventListener('pointermove', onPointerMove);
      this.unitVisuals.clear();
      // Blocks that are off screen live outside the display list, so the scene would not destroy them.
      for (const chunk of this.chunks) for (const image of chunk.images ?? []) image.destroy();
      this.chunks = [];
      this.weapons?.destroy();
      this.satellites?.destroy();
      this.robots?.destroy();
    });
  }

  update(_time: number, delta: number) {
    // Frame-rate independent follow and shortest-angle turns; no tween is restarted per snapshot.
    const seconds = Math.min(delta, 100) / 1000;
    const follow = 1 - Math.exp(-seconds / 0.065);
    const turn = 1 - Math.exp(-seconds / 0.18);
    for (const visual of this.unitVisuals.values()) {
      visual.container.x += (visual.targetX - visual.container.x) * follow;
      visual.container.y += (visual.targetY - visual.container.y) * follow;
      const angle = Math.atan2(Math.sin(visual.heading - visual.hull.rotation), Math.cos(visual.heading - visual.hull.rotation));
      visual.hull.rotation += angle * turn;
      // Changing a depth re-sorts the whole scene, so only do it when the ship crosses a row.
      const depth = DEPTH.units + Math.round(visual.container.y);
      if (visual.container.depth !== depth) visual.container.setDepth(depth);
      if (visual.cooldown) {
        // Interpolate at most one server tick; a paused/disconnected game cannot recharge locally.
        const elapsed = this.snapshot.clockRunning ? Math.min(1, (this.time.now - this.serverTickAt) / 1000 * (this.snapshot.tickRate ?? 10)) : 0;
        const remaining = Math.max(0, visual.cooldown.remainingTicks - elapsed);
        visual.reload.width = 38 * (1 - remaining / Math.max(1, visual.cooldown.durationTicks));
      }
    }
    // Satellites animate between server ticks, at most one tick ahead of the last view.
    const tickRate = this.snapshot.tickRate ?? 10;
    const ahead = this.snapshot.clockRunning ? Math.min(1, (this.time.now - this.serverTickAt) / 1000 * tickRate) : 0;
    this.satellites?.update(this.snapshot.tick + ahead, tickRate);
    this.robots?.update(Math.min(delta, 100));
    const camera = this.cameras.main;
    const pointer = this.input.activePointer;
    const edge = this.pointerOnCanvas && !this.dragOrigin && !this.selectionDrag && pointer.x >= 0 && pointer.y >= 0
      && pointer.x < this.scale.width && pointer.y < this.scale.height;
    // The closer the pointer is to the border, the faster the drift; it eases in and out instead of jumping.
    const drift = (position: number, size: number) => {
      if (!edge) return 0;
      const depth = position < EDGE_ZONE ? -(1 - position / EDGE_ZONE) : position > size - EDGE_ZONE ? 1 - (size - position) / EDGE_ZONE : 0;
      return Math.sign(depth) * Phaser.Math.Easing.Quadratic.Out(Math.abs(depth));
    };
    const cameraKey = (key: Phaser.Input.Keyboard.Key | undefined) => key?.isDown;
    const keys = (positive: boolean | undefined, negative: boolean | undefined) => Number(Boolean(positive)) - Number(Boolean(negative));
    const wanted = {
      x: Phaser.Math.Clamp(keys(this.cursors?.right.isDown || cameraKey(this.movementKeys?.right), this.cursors?.left.isDown || cameraKey(this.movementKeys?.left)) + drift(pointer.x, this.scale.width), -1, 1),
      y: Phaser.Math.Clamp(keys(this.cursors?.down.isDown || cameraKey(this.movementKeys?.down), this.cursors?.up.isDown || cameraKey(this.movementKeys?.up)) + drift(pointer.y, this.scale.height), -1, 1),
    };
    const ease = 1 - Math.exp(-seconds / PAN_EASE);
    this.panVelocity.x += (wanted.x * PAN_SPEED - this.panVelocity.x) * ease;
    this.panVelocity.y += (wanted.y * PAN_SPEED - this.panVelocity.y) * ease;
    if (Math.abs(this.panVelocity.x) < 2 && wanted.x === 0) this.panVelocity.x = 0;
    if (Math.abs(this.panVelocity.y) < 2 && wanted.y === 0) this.panVelocity.y = 0;
    camera.scrollX += this.panVelocity.x * seconds / camera.zoom;
    camera.scrollY += this.panVelocity.y * seconds / camera.zoom;
    if (Math.abs(this.zoomTarget - camera.zoom) > 0.0005) {
      const next = Math.abs(this.zoomTarget - camera.zoom) < 0.004 ? this.zoomTarget
        : camera.zoom + (this.zoomTarget - camera.zoom) * (1 - Math.exp(-seconds / ZOOM_EASE));
      this.zoomAround(next, this.zoomAnchor ?? { x: camera.width / 2, y: camera.height / 2 });
    }
    this.refreshCameraView();
    this.prepareTerrain();
  }

  sync(snapshot: GameplayViewModel) {
    if (snapshot.tick !== this.snapshot.tick && this.sys.isActive()) this.serverTickAt = this.time.now;
    this.snapshot = snapshot;
    if (snapshot.activeAction !== null && snapshot.activeAction !== 'move') this.hoverPoint = null;
    if (this.sys.isActive()) this.renderSnapshot();
  }

  /** Zoom that frames both bases. A small sector (Sector 01) fits on screen at a readable zoom
   * and opens whole; a large one (Espiral 96×96) would need a tiny zoom and opens on your fleet. */
  private fitZoom() {
    return playerViewZoom(this.scale.width, this.scale.height);
  }
  private fitsWholeMap() {
    return this.fitZoom() >= ZOOM_MIN;
  }

  /** Back to the opening view, centred on your base. A small sector keeps the zoom that shows
   * nearly all of it; a large one opens at the default zoom. Centring matters: framing both bases
   * left yours under the HUD panels, where it could not be clicked. */
  resetCamera() {
    const zoom = this.fitsWholeMap() ? this.fitZoom() : ZOOM_DEFAULT;
    this.cameras.main.setZoom(zoom);
    this.zoomTarget = zoom;
    const base = this.snapshot.base?.position;
    const center = base ? cellToIso(base.x, base.y) : playerViewCenter();
    this.cameras.main.centerOn(center.x, center.y);
    this.refreshCameraView();
  }

  /** Opening focus on the player's fleet. False while the scene is still loading. */
  focusFleet(x: number, y: number): boolean {
    return this.created && this.centerOnCell(x, y);
  }

  private zoomLimits() {
    const fit = this.fitZoom();
    return this.fitsWholeMap() ? { min: Math.min(fit, ZOOM_MAX), max: Math.max(fit, ZOOM_MAX) } : { min: ZOOM_MIN, max: ZOOM_MAX };
  }

  /** False until Phaser has created the camera; callers may retry. */
  centerOnCell(x: number, y: number): boolean {
    const camera = this.cameras?.main;
    if (!camera || !this.created) return false;
    const cell = cellToIso(Phaser.Math.Clamp(x, 0, sectorMap.width - 1), Phaser.Math.Clamp(y, 0, sectorMap.height - 1));
    camera.centerOn(cell.x, cell.y);
    this.refreshCameraView();
    return true;
  }

  private refreshCameraView() {
    const camera = this.cameras.main;
    const cameraKey = `${Math.round(camera.scrollX)},${Math.round(camera.scrollY)},${camera.zoom},${camera.width},${camera.height}`;
    if (cameraKey === this.lastCameraView) return;
    this.lastCameraView = cameraKey;
    this.cullTerrain();
    // Phaser zooms around the camera centre, so the visible area is centred on scroll + half the viewport.
    const width = camera.width / camera.zoom;
    const height = camera.height / camera.zoom;
    const worldX = camera.scrollX + camera.width / 2 - width / 2;
    const worldY = camera.scrollY + camera.height / 2 - height / 2;
    this.onCameraChange({
      x: worldX / ISO_WORLD_WIDTH, y: worldY / ISO_WORLD_HEIGHT,
      width: width / ISO_WORLD_WIDTH, height: height / ISO_WORLD_HEIGHT,
      worldX, worldY, zoom: camera.zoom,
    });
  }

  /** Zoom keeping the world point under a screen position where it is. The camera zooms around its centre. */
  private zoomAround(zoom: number, anchor: { x: number; y: number }) {
    const camera = this.cameras.main;
    const offsetX = anchor.x - camera.width / 2, offsetY = anchor.y - camera.height / 2;
    camera.scrollX += offsetX / camera.zoom - offsetX / zoom;
    camera.scrollY += offsetY / camera.zoom - offsetY / zoom;
    camera.setZoom(zoom);
  }

  /** Index the terrain in blocks. Their tile images are created the first time a block is on screen. */
  private drawTerrain() {
    this.terrainLayers = sectorMap.layers.filter((layer) => layer.visible && layer.data && !HIDDEN_LAYERS.has(layer.name))
      .map((layer, order) => ({ data: layer.data, order }));
    this.fogShown = Array.from({ length: sectorMap.width * sectorMap.height }, () => true);
    this.chunks = [];
    this.solidGround.clear();
    for (const tileset of sectorMap.tilesets) {
      const key = textureKey(tileset);
      if (!isFlat(tileset) || !key || !this.textures.exists(key)) continue;
      const count = this.textures.get(key).frameTotal - 1;
      for (let tile = 0; tile < count; tile++) {
        // Sample the diamond: a tile is solid when every probe is opaque.
        let solid = true;
        for (let v = -3; v <= 3 && solid; v++) for (let u = -3; u <= 3 && solid; u++) {
          if (Math.abs(u) + Math.abs(v) > 3) continue;
          const alpha = this.textures.getPixelAlpha(Math.round(31.5 + u * 9), Math.round(15.5 + v * 4.5), key, tile);
          solid = alpha !== null && alpha >= 250;
        }
        if (solid) this.solidGround.add(tileset.firstgid + tile);
      }
    }
    for (let y0 = 0; y0 < sectorMap.height; y0 += CHUNK_CELLS) for (let x0 = 0; x0 < sectorMap.width; x0 += CHUNK_CELLS) {
      const x1 = Math.min(sectorMap.width, x0 + CHUNK_CELLS), y1 = Math.min(sectorMap.height, y0 + CHUNK_CELLS);
      // Screen box of the block, with room above for tall tiles such as asteroids.
      const corners = [cellToIso(x0, y0), cellToIso(x1 - 1, y0), cellToIso(x0, y1 - 1), cellToIso(x1 - 1, y1 - 1)];
      this.chunks.push({ x0, y0, x1, y1, images: null, shown: false,
        left: Math.min(...corners.map((corner) => corner.x)) - TILE_WIDTH,
        right: Math.max(...corners.map((corner) => corner.x)) + TILE_WIDTH,
        top: Math.min(...corners.map((corner) => corner.y)) - 220,
        bottom: Math.max(...corners.map((corner) => corner.y)) + 64 });
    }
    this.drawMapObjects();
    this.cullTerrain();
  }

  /** Keep only the blocks inside the camera in the display list: what is off screen costs nothing per frame. */
  private visibleWorldBox() {
    const camera = this.cameras.main;
    const halfWidth = camera.width / camera.zoom / 2;
    const halfHeight = camera.height / camera.zoom / 2;
    const centerX = camera.scrollX + camera.width / 2;
    const centerY = camera.scrollY + camera.height / 2;
    return { left: centerX - halfWidth, right: centerX + halfWidth, top: centerY - halfHeight, bottom: centerY + halfHeight };
  }

  private cullTerrain() {
    const view = this.visibleWorldBox();
    for (const chunk of this.chunks) {
      const visible = chunk.right >= view.left && chunk.left <= view.right && chunk.bottom >= view.top && chunk.top <= view.bottom;
      if (visible === chunk.shown) continue;
      chunk.shown = visible;
      if (!chunk.images) { chunk.images = this.buildChunk(chunk); continue; }
      for (const image of chunk.images) {
        if (visible) image.addToDisplayList();
        else image.removeFromDisplayList();
      }
    }
  }

  /** Build one block just outside the view per frame, so scrolling into it does not stutter. */
  private prepareTerrain() {
    const view = this.visibleWorldBox();
    const margin = CHUNK_CELLS * TILE_WIDTH;
    const chunk = this.chunks.find((candidate) => !candidate.images && candidate.right >= view.left - margin
      && candidate.left <= view.right + margin && candidate.bottom >= view.top - margin && candidate.top <= view.bottom + margin);
    if (!chunk) return;
    chunk.images = this.buildChunk(chunk);
    if (!chunk.shown) for (const image of chunk.images) image.removeFromDisplayList();
  }

  private buildChunk(chunk: TerrainChunk): Phaser.GameObjects.Image[] {
    const images: Phaser.GameObjects.Image[] = [];
    const columns = sectorMap.width;
    for (const [depth, layer] of this.terrainLayers.entries()) {
      for (let y = chunk.y0; y < chunk.y1; y++) for (let x = chunk.x0; x < chunk.x1; x++) {
        const gid = layer.data[y * columns + x]! & GID_MASK;
        if (!gid) continue;
        const point = cellToIso(x, y);
        const tileset = tilesetFor(gid);
        // Flat ground completely covered by a solid tile of a higher layer is never seen: do not create it.
        if (tileset && isFlat(tileset) && this.terrainLayers.slice(depth + 1)
          .some((above) => this.solidGround.has(above.data[y * columns + x]! & GID_MASK))) continue;
        const key = tileset && textureKey(tileset);
        if (!tileset || !key || !this.textures.exists(key)) {
          this.terrain?.fillStyle(0x0a1726, 1).fillRect(point.x - 32, point.y - 16, 64, 32);
          continue;
        }
        // Tiled anchors an isometric tile image at the bottom of its cell, left edge on the cell's left corner.
        const offset = tileset.tileoffset ?? { x: 0, y: 0 };
        const image = this.add.image(point.x - TILE_WIDTH / 2 + offset.x + tileset.tilewidth / 2,
          point.y + TILE_HALF_HEIGHT + offset.y, key, gid - tileset.firstgid)
          .setOrigin(0.5, 1).setDepth(DEPTH.layer * layer.order + (x + y) * 32 + x);
        if (this.fogShown[y * columns + x] === false) image.setTint(FOG_TINT);
        (this.tileImages[y * columns + x] ??= []).push(image);
        images.push(image);
      }
    }
    return images;
  }

  /** Tile objects (bases, pillars, wrecks…) placed in Tiled object layers, bottom-anchored at their point. */
  private drawMapObjects() {
    for (const layer of sectorMap.layers) {
      // Robots are animated by RobotEffects, not drawn as static art.
      // The obstacle preview is for Tiled: the game draws obstacles from the simulation, below.
      if (!layer.visible || !layer.objects || layer.name === ROBOT_LAYER || layer.name === OBSTACLE_PREVIEW_LAYER) continue;
      for (const object of layer.objects) {
        if (!object.gid || object.visible === false) continue;
        const gid = object.gid & GID_MASK;
        const tileset = tilesetFor(gid);
        const key = tileset && textureKey(tileset, gid - tileset.firstgid);
        if (!key || !this.textures.exists(key)) continue;
        // Object positions are in tile-height pixels along both isometric axes.
        const cellX = object.x / TILE_HALF_HEIGHT / 2;
        const cellY = object.y / TILE_HALF_HEIGHT / 2;
        const point = cellToIso(cellX, cellY);
        const image = this.add.image(point.x, point.y - TILE_HALF_HEIGHT, key)
          .setDisplaySize(object.width, object.height).setOrigin(0.5, 1).setDepth(DEPTH.units + point.y - TILE_HALF_HEIGHT);
        const col = Phaser.Math.Clamp(Math.floor(cellX), 0, sectorMap.width - 1);
        const row = Phaser.Math.Clamp(Math.floor(cellY), 0, sectorMap.height - 1);
        (this.tileImages[row * sectorMap.width + col] ??= []).push(image);
      }
    }
    // Obstacles the map marks with OBSTACLE_RING points: the simulation already closed their cells.
    for (const obstacle of sectorSurface.obstaculos ?? []) {
      const key = structureKey(obstacle.model);
      if (!key || !this.textures.exists(key)) continue;
      const point = cellToIso(obstacle.x, obstacle.y);
      const image = this.add.image(point.x, point.y - TILE_HALF_HEIGHT, key).setOrigin(0.5, 0.72).setDepth(DEPTH.units + point.y - TILE_HALF_HEIGHT);
      (this.tileImages[Math.floor(obstacle.y) * sectorMap.width + Math.floor(obstacle.x)] ??= []).push(image);
    }
  }

  private drawCore() {
    const graphics = this.core;
    if (!graphics) return;
    const center = cellToIso(sectorSurface.core.x, sectorSurface.core.y);
    const hue = coreColor(this.snapshot.core.state);
    graphics.clear();
    graphics.fillStyle(0x071420, 0.8);
    graphics.fillEllipse(center.x, center.y + 9, 72, 38);
    graphics.lineStyle(2, hue, 0.84);
    graphics.strokeEllipse(center.x, center.y + 9, 62, 31);
    graphics.fillStyle(hue, 0.95);
    graphics.fillTriangle(center.x, center.y - 19, center.x + 8, center.y - 3, center.x - 8, center.y - 3);
    if (this.snapshot.core.progress > 0 && this.snapshot.core.state !== 'locked') {
      graphics.lineStyle(4, hue, 1);
      graphics.beginPath();
      graphics.arc(center.x, center.y + 9, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.snapshot.core.progress / 100);
      graphics.strokePath();
    }
  }


  /** Resource nodes: a ring in the owner's colour (grey while unclaimed); Metal nodes carry a diamond. */
  private drawNodes() {
    const graphics = this.nodeMarks;
    if (!graphics) return;
    graphics.clear();
    for (const node of this.snapshot.nodes) {
      const center = cellToIso(node.x, node.y);
      const hue = node.owner === 'blue' ? color.blue : node.owner === 'red' ? color.red : 0x8aa0b8;
      // A freshly captured node is faint until it starts producing.
      graphics.lineStyle(2, hue, node.stabilizingSeconds ? 0.35 : 0.9);
      graphics.strokeEllipse(center.x, center.y + 9, 54, 27);
      if (node.kind === 'metal') {
        graphics.fillStyle(hue, 0.95);
        graphics.fillPoints(polygon([{ x: center.x, y: center.y - 2 }, { x: center.x + 7, y: center.y + 9 },
          { x: center.x, y: center.y + 20 }, { x: center.x - 7, y: center.y + 9 }]), true);
      }
    }
  }

  /** Base hull bars, the shield before bases are exposed and one pip per finished module. */
  private drawBases() {
    const graphics = this.baseMarks;
    if (!graphics) return;
    graphics.clear();
    const own = this.snapshot.base;
    const enemy = this.snapshot.enemyBase;
    const shielded = (own?.vulnerableInSeconds ?? 0) > 0;
    const bases = [
      own?.position && own.hp !== undefined && own.maxHp ? { at: own.position, hp: own.hp, maxHp: own.maxHp, hue: 0x5fd49a,
        modules: (own.modules?.refinery ?? 0) + (own.modules?.extras.length ?? 0) } : null,
      enemy?.visible && enemy.hp !== undefined && enemy.maxHp ? { at: enemy, hp: enemy.hp, maxHp: enemy.maxHp, hue: color.red, modules: 0 } : null,
    ];
    for (const base of bases) {
      if (!base) continue;
      const center = cellToIso(base.at.x, base.at.y);
      if (shielded) {
        graphics.lineStyle(2, 0x83d4ff, 0.45);
        graphics.strokeEllipse(center.x, center.y + 4, 150, 75);
      }
      // Above the station art, framed so it never blends with the sprite's own lights.
      const width = 112;
      const top = center.y - 150;
      graphics.fillStyle(0x071420, 0.9);
      graphics.fillRect(center.x - width / 2 - 2, top - 2, width + 4, 12);
      graphics.lineStyle(1, 0xd8e6f3, 0.7);
      graphics.strokeRect(center.x - width / 2 - 2, top - 2, width + 4, 12);
      graphics.fillStyle(base.hue, 0.95);
      graphics.fillRect(center.x - width / 2, top, width * Math.max(0, base.hp) / base.maxHp, 8);
      for (let pip = 0; pip < base.modules; pip++) {
        graphics.fillStyle(0x7fe0b0, 0.95);
        graphics.fillRect(center.x - width / 2 + pip * 10, top + 13, 7, 4);
      }
    }
  }

  /** Darken the tile art of every cell outside the player's current vision. Only changed cells are touched. */
  private drawFog() {
    const cells = this.snapshot.visibleCells;
    // The adapter hands over the same array until the server sends new vision.
    if (cells === this.fogSource) return;
    this.fogSource = cells;
    const total = sectorMap.width * sectorMap.height;
    for (let index = 0; index < total; index++) {
      const visible = cells ? cells[index] === true : true;
      if (this.fogShown[index] === visible) continue;
      this.fogShown[index] = visible;
      for (const image of this.tileImages[index] ?? []) {
        if (visible) image.clearTint();
        else image.setTint(FOG_TINT);
      }
    }
  }

  previewBaseRange(enabled:boolean):void {
    this.showBaseRange=enabled;
    this.drawAttackRanges();
  }

  /** A visual guide from server-provided stats; hit validation stays in the simulation. */
  private drawAttackRanges():void {
    const graphics=this.attackRanges;if(!graphics)return;
    const selected=this.snapshot.squads.find(s=>s.id===this.snapshot.selectedSquadId&&s.visible&&s.healthPercent>0);
    const base=this.showBaseRange?this.snapshot.base:undefined;
    const origin=base?.position??(selected?{x:Math.round(selected.gridX),y:Math.round(selected.gridY)}:undefined);
    const range=base?.range??selected?.stats?.range??(selected?this.snapshot.unitStats?.[selected.unitType]?.range:0)??0;
    const key=!origin||range<=0?'':`${origin.x},${origin.y},${range},${base?1:0}`;
    if(key===this.rangeKey)return;
    this.rangeKey=key;graphics.clear();
    if(!origin||range<=0)return;
    const hue=base?0x78d7d0:0x84c8fa;
    for(let dy=-range;dy<=range;dy++)for(let dx=-range;dx<=range;dx++){
      if(base&&Math.abs(dx)+Math.abs(dy)>range)continue;
      const x=origin.x+dx,y=origin.y+dy;
      if(x<0||y<0||x>=sectorMap.width||y>=sectorMap.height)continue;
      if(!sectorSurface.walkable[y*sectorMap.width+x])continue;
      const at=cellToIso(x,y),points=[{x:at.x,y:at.y-16},{x:at.x+32,y:at.y},{x:at.x,y:at.y+16},{x:at.x-32,y:at.y}];
      graphics.fillStyle(hue,.055);graphics.fillPoints(polygon(points),true);
      graphics.lineStyle(1,hue,.23);graphics.strokePoints(polygon(points),true);
    }
  }

  private renderSnapshot() {
    this.drawCore();
    this.drawNodes();
    this.drawBases();
    this.drawFog();
    this.drawRoute();
    this.drawAttackRanges();
    this.satellites?.sync(this.snapshot.satellites ?? [], this.snapshot.tick);
    this.robots?.sync(this.snapshot);
    const visible = new Set(this.snapshot.squads.filter((squad) => squad.visible).map((squad) => squad.id));
    for (const [id, visual] of this.unitVisuals) {
      if (visible.has(id)) continue;
      this.tweens.killTweensOf(visual.container);
      visual.container.destroy();
      this.unitVisuals.delete(id);
    }
    for (const squad of this.snapshot.squads.filter((candidate) => candidate.visible)) {
      const visual = this.unitVisuals.get(squad.id) ?? this.createUnit(squad);
      visual.selection.setVisible(squad.selected);
      visual.label.setVisible(squad.selected);
      if (squad.healthPercent < visual.healthPercent) {
        visual.hitFlash.setAlpha(0.9);
        this.tweens.killTweensOf(visual.hitFlash);
        this.tweens.add({ targets: visual.hitFlash, alpha: 0, duration: 250 });
      }
      visual.healthPercent = squad.healthPercent;
      visual.health.width = 38 * squad.healthPercent / 100;
      visual.cooldown = squad.attackCooldown;
      visual.reloadBack.setVisible(!!squad.attackCooldown);
      visual.reload.setVisible(!!squad.attackCooldown);
      if (squad.lastShot && squad.lastShot.tick > visual.lastShotTick) {
        visual.lastShotTick = squad.lastShot.tick;
        if (this.snapshot.tick - squad.lastShot.tick <= 2 && this.snapshot.clockRunning) {
          this.weapons?.fire(squad, { x: visual.container.x, y: visual.container.y });
          if (visual.gridX === squad.gridX && visual.gridY === squad.gridY) {
            const aim = cellToIso(squad.lastShot.to.x, squad.lastShot.to.y);
            visual.heading = Math.atan2(aim.y - visual.container.y, aim.x - visual.container.x) + Math.PI / 2;
          }
        }
      }
      if (visual.gridX === squad.gridX && visual.gridY === squad.gridY) continue;
      const previous = cellToIso(visual.gridX, visual.gridY);
      visual.gridX = squad.gridX;
      visual.gridY = squad.gridY;
      const point = cellToIso(squad.gridX, squad.gridY);
      if (Math.hypot(point.x - previous.x, point.y - previous.y) > 0.01)
        visual.heading = Math.atan2(point.y - previous.y, point.x - previous.x) + Math.PI / 2;
      visual.targetX = point.x;
      visual.targetY = point.y;
      if (Math.hypot(point.x - previous.x, point.y - previous.y) > 160) visual.container.setPosition(point.x, point.y);
    }
  }

  private createUnit(squad: SquadViewModel): UnitVisual {
    const point = cellToIso(squad.gridX, squad.gridY);
    const allied = squad.owner === 'blue';
    const neutral = squad.owner === 'neutral';
    const primary = allied ? color.blue : neutral ? color.neutral : color.red;
    const light = allied ? color.blueLight : neutral ? color.neutralLight : color.redLight;
    const container = this.add.container(point.x, point.y).setDepth(DEPTH.units + point.y);
    const selection = this.add.graphics();
    selection.lineStyle(2, light, 0.98);
    selection.strokeEllipse(0, 6, 55, 28);
    selection.lineStyle(1, light, 0.4);
    selection.strokeEllipse(0, 6, 62, 34);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x020912, 0.7);
    shadow.fillEllipse(0, 9, 46, 18);
    const marker = this.add.graphics();
    marker.fillStyle(allied ? 0xa4d8e5 : neutral ? 0xe6cf95 : 0xe1a1a9, 1);
    if (squad.unitType === 'interceptor') {
      marker.fillPoints(polygon([{ x: 0, y: -38 }, { x: 12, y: -1 }, { x: 34, y: 13 }, { x: 8, y: 8 },
        { x: 0, y: 17 }, { x: -8, y: 8 }, { x: -34, y: 13 }, { x: -12, y: -1 }]), true);
      marker.fillStyle(0x223a4a, 1);
      marker.fillTriangle(0, -28, 8, 4, -8, 4);
    } else if (squad.unitType === 'bomber') {
      marker.fillPoints(polygon([{ x: 0, y: -40 }, { x: 19, y: -28 }, { x: 24, y: 0 },
        { x: 37, y: 16 }, { x: 13, y: 16 }, { x: 0, y: 24 }, { x: -13, y: 16 },
        { x: -37, y: 16 }, { x: -24, y: 0 }, { x: -19, y: -28 }]), true);
      marker.fillStyle(0x263c4b, 1);
      marker.fillRect(-14, -19, 28, 31);
      marker.fillStyle(0xf7e77c, 1);
      marker.fillCircle(0, 4, 5);
    } else {
      marker.fillPoints(polygon([{ x: 0, y: -38 }, { x: 15, y: -22 }, { x: 18, y: 7 }, { x: 28, y: 14 },
        { x: 10, y: 13 }, { x: 0, y: 23 }, { x: -10, y: 13 }, { x: -28, y: 14 },
        { x: -18, y: 7 }, { x: -15, y: -22 }]), true);
      marker.fillStyle(0x243b4e, 1);
      marker.fillRect(-9, -20, 18, 25);
    }
    marker.fillStyle(primary, 1);
    marker.fillTriangle(0, -23, 6, -7, -6, -7);
    marker.fillCircle(-11, 16, 4);
    marker.fillCircle(11, 16, 4);
    const hitFlash = this.add.graphics();
    hitFlash.fillStyle(0xffd4a1, 0.75);
    hitFlash.fillCircle(0, -8, 28);
    hitFlash.setAlpha(0);
    marker.setScale(squad.unitType==='bomber'?0.65:0.58);
    const label = this.add.text(0, 32, squad.callSign.toUpperCase(), {
      color: allied ? '#83d4ff' : neutral ? '#f7d774' : '#ff9ba7', fontFamily: 'Rajdhani, sans-serif', fontSize: '11px', fontStyle: '600', letterSpacing: 1,
    }).setOrigin(0.5, 0);
    const healthBack = this.add.rectangle(0, 23, 38, 3, color.grid).setOrigin(0.5);
    const health = this.add.rectangle(-19, 23, 38 * squad.healthPercent / 100, 3, squad.healthPercent > 35 ? 0x4ad69a : color.red).setOrigin(0, 0.5);
    const reloadBack = this.add.rectangle(0, 28, 38, 2, 0x303b48).setOrigin(0.5);
    const reload = this.add.rectangle(-19, 28, 38, 2, 0xa0aab6).setOrigin(0, 0.5);
    container.add([selection, shadow, marker, hitFlash, label, healthBack, health, reloadBack, reload]);
    container.setInteractive(new Phaser.Geom.Ellipse(0, 0, 62, 55), Phaser.Geom.Ellipse.Contains);
    container.setData('unitId', squad.id);
    const visual = { container, selection, hull: marker, label, hitFlash, health, reloadBack, reload, lastShotTick: -1,
      healthPercent: squad.healthPercent, gridX: squad.gridX, gridY: squad.gridY,
      targetX: point.x, targetY: point.y, heading: 0 };
    this.unitVisuals.set(squad.id, visual);
    return visual;
  }

  private seatPreview: { key: string; seats: Map<string, GridPoint> } | null = null;
  /** Cell of the last group order: hovering it shows the seats given, not a fresh preview. */
  private orderedCell: GridPoint | null = null;

  /** One tile outline per ship: where a group order will seat it (hover) or has seated it (order). */
  private drawFormationSeats(graphics: Phaser.GameObjects.Graphics) {
    const group = this.snapshot.squads.filter((squad) => squad.selected && squad.owner === 'blue' && squad.healthPercent > 0);
    if (group.length < 2) return;
    const aiming = (this.snapshot.activeAction === null || this.snapshot.activeAction === 'move') && this.hoverPoint;
    const center = aiming ? { x: Math.round(this.hoverPoint!.x), y: Math.round(this.hoverPoint!.y) } : null;
    if (this.orderedCell && (center?.x !== this.orderedCell.x || center?.y !== this.orderedCell.y)) this.orderedCell = null;
    const preview = !!center && !this.orderedCell && center.x >= 0 && center.y >= 0 && center.x < sectorMap.width && center.y < sectorMap.height
      && sectorSurface.walkable[center.y * sectorMap.width + center.x] === true;
    if (preview) {
      const formation = this.snapshot.formation ?? DEFAULT_FORMATION;
      const key = `${formation}:${center!.x},${center!.y}:${group.map((ship) => `${ship.id}@${Math.round(ship.gridX)},${Math.round(ship.gridY)}`).join(';')}`;
      if (this.seatPreview?.key !== key) {
        this.seatPreview = { key, seats: formationSeats(group.map((ship) => ({ id: ship.id, x: ship.gridX, y: ship.gridY })), center!, formation) };
      }
    }
    const halfWidth = TILE_WIDTH / 2 * 0.62;
    const halfHeight = TILE_HALF_HEIGHT * 0.62;
    for (const ship of group) {
      const seat = preview ? this.seatPreview?.seats.get(ship.id) : ship.destination;
      if (!seat) continue;
      const point = cellToIso(seat.x, seat.y);
      const hue = preview ? color.blueLight : color.blue;
      const outline = [
        new Phaser.Math.Vector2(point.x, point.y - halfHeight), new Phaser.Math.Vector2(point.x + halfWidth, point.y),
        new Phaser.Math.Vector2(point.x, point.y + halfHeight), new Phaser.Math.Vector2(point.x - halfWidth, point.y),
      ];
      graphics.fillStyle(hue, preview ? 0.1 : 0.16);
      graphics.fillPoints(outline, true);
      graphics.lineStyle(1.5, hue, preview ? 0.55 : 0.8);
      graphics.strokePoints(outline, true);
    }
  }

  private drawRoute() {
    const graphics = this.route;
    if (!graphics) return;
    graphics.clear();
    const selected = this.snapshot.squads.find((squad) => squad.id === this.snapshot.selectedSquadId);
    if (!selected) return;
    for (const attacker of this.snapshot.squads.filter((squad) => squad.selected && squad.attackTargetId)) {
      const attackTarget = this.snapshot.squads.find((squad) => squad.id === attacker.attackTargetId && squad.visible);
      if (!attackTarget) continue;
      const from = cellToIso(attacker.gridX, attacker.gridY);
      const to = cellToIso(attackTarget.gridX, attackTarget.gridY);
      graphics.lineStyle(2, color.red, 0.88);
      graphics.lineBetween(from.x, from.y, to.x, to.y);
      graphics.strokeEllipse(to.x, to.y, 70, 35);
    }
    const preview = (this.snapshot.activeAction === null || this.snapshot.activeAction === 'move') && this.hoverPoint
      ? this.previewRoute(selected, this.hoverPoint) : [];
    const ordered = this.snapshot.moveOrder?.squadId === selected.id ? this.snapshot.moveOrder.route : [];
    const path = preview.length > 1 ? preview : ordered;
    if (this.hoverPoint && !sectorSurface.walkable[Math.round(this.hoverPoint.y) * sectorMap.width + Math.round(this.hoverPoint.x)]) {
      const blocked = cellToIso(this.hoverPoint.x, this.hoverPoint.y);
      graphics.lineStyle(2, color.red, 0.9);
      graphics.strokeEllipse(blocked.x, blocked.y, 52, 28);
      graphics.lineBetween(blocked.x - 10, blocked.y - 7, blocked.x + 10, blocked.y + 7);
      graphics.lineBetween(blocked.x + 10, blocked.y - 7, blocked.x - 10, blocked.y + 7);
    }
    this.drawFormationSeats(graphics);
    if (path.length < 2) return;
    const hue = preview.length > 1 ? color.blueLight : color.blue;
    graphics.lineStyle(3, hue, 0.9);
    graphics.beginPath();
    path.forEach((cell, index) => {
      const point = cellToIso(cell.x, cell.y);
      if (index === 0) graphics.moveTo(point.x, point.y);
      else graphics.lineTo(point.x, point.y);
    });
    graphics.strokePath();
    for (const cell of path.slice(1, -1)) {
      const point = cellToIso(cell.x, cell.y);
      graphics.fillStyle(hue, 0.85);
      graphics.fillCircle(point.x, point.y, 3);
    }
    const last = path[path.length - 1];
    if (!last) return;
    const destination = cellToIso(last.x, last.y);
    graphics.fillStyle(hue, 0.12);
    graphics.fillEllipse(destination.x, destination.y, 58, 30);
    graphics.lineStyle(2, hue, 1);
    graphics.strokeEllipse(destination.x, destination.y, 58, 30);
  }

  /** Path preview under the cursor. Planning is A* over the map, so it is redone only when either end moves. */
  private previewRoute(selected: SquadViewModel, hover: GridPoint): GridPoint[] {
    const key = `${selected.id}:${Math.round(selected.gridX * 2)},${Math.round(selected.gridY * 2)}:${hover.x.toFixed(1)},${hover.y.toFixed(1)}`;
    if (key !== this.previewKey) {
      this.previewKey = key;
      this.previewPath = planSectorMove({ x: selected.gridX, y: selected.gridY }, hover);
    }
    return this.previewPath;
  }

  private pointerPosition(pointer: Phaser.Input.Pointer) {
    const bounds = this.game.canvas.getBoundingClientRect();
    const event = pointer.event;
    const clientX = 'clientX' in event ? event.clientX : event.changedTouches[0]?.clientX ?? bounds.left;
    const clientY = 'clientY' in event ? event.clientY : event.changedTouches[0]?.clientY ?? bounds.top;
    return {
      x: (clientX - bounds.left) * this.scale.width / bounds.width,
      y: (clientY - bounds.top) * this.scale.height / bounds.height,
    };
  }

  private pointerPoint(pointer: Phaser.Input.Pointer) {
    const position = this.pointerPosition(pointer);
    const world = this.cameras.main.getWorldPoint(position.x, position.y);
    return isoToPoint(world.x, world.y);
  }

  /** Double click: every own ship of the clicked ship's class that is currently on screen (StarCraft style). */
  private sameTypeOnScreen(clickedId: string): string[] {
    const clicked = this.snapshot.squads.find((squad) => squad.id === clickedId);
    if (!clicked) return [clickedId];
    const view = this.visibleWorldBox();
    return this.snapshot.squads
      .filter((squad) => squad.owner === 'blue' && squad.unitType === clicked.unitType && squad.visible && squad.healthPercent > 0)
      .filter((squad) => {
        const point = cellToIso(squad.gridX, squad.gridY);
        return point.x >= view.left && point.x <= view.right && point.y >= view.top && point.y <= view.bottom;
      })
      .map((squad) => squad.id);
  }

  private drawSelectionBox() {
    const graphics = this.selectionBox;
    graphics?.clear();
    if (!graphics || !this.selectionDrag) return;
    const { start, current } = this.selectionDrag;
    if (Math.max(Math.abs(start.x - current.x), Math.abs(start.y - current.y)) < 6) return;
    // Screen-fixed graphics are still zoomed around the viewport centre; undo that so the box sits under the cursor.
    const camera = this.cameras.main;
    const toLayer = (point: { x: number; y: number }) => ({
      x: camera.width / 2 + (point.x - camera.width / 2) / camera.zoom,
      y: camera.height / 2 + (point.y - camera.height / 2) / camera.zoom,
    });
    const a = toLayer(start);
    const b = toLayer(current);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const width = Math.abs(a.x - b.x);
    const height = Math.abs(a.y - b.y);
    graphics.fillStyle(color.blue, 0.12);
    graphics.fillRect(x, y, width, height);
    graphics.lineStyle(2 / camera.zoom, color.blueLight, 0.9);
    graphics.strokeRect(x, y, width, height);
  }

  private configureInput() {
    this.input.setTopOnly(false);
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.movementKeys = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    }
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (pointer.middleButtonDown()) {
        const position = this.pointerPosition(pointer);
        this.dragOrigin = { ...position, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY };
        return;
      }
      if (pointer.leftButtonDown()) {
        const position = this.pointerPosition(pointer);
        const world = this.cameras.main.getWorldPoint(position.x, position.y);
        const gap = (id: string) => {
          const visual = this.unitVisuals.get(id);
          return visual ? Math.hypot(visual.container.x - world.x, visual.container.y - world.y) : Infinity;
        };
        // Hit areas may overlap in a crowded hangar. Pick the hull under the click,
        // rather than whichever container Phaser happens to report first.
        const clickedId = over.map((object) => object.getData('unitId'))
          .filter((id): id is string => typeof id === 'string' && this.snapshot.squads.some((squad) => squad.id === id && squad.owner === 'blue' && squad.visible && squad.healthPercent > 0))
          .sort((a, b) => gap(a) - gap(b) || a.localeCompare(b))[0] ?? null;
        this.selectionDrag = { start: position, current: position, clickedId };
        return;
      }
      if (!pointer.rightButtonDown()) return;
      const enemy = over.map((object) => object.getData('unitId'))
        .map((id) => this.snapshot.squads.find((squad) => squad.id === id && squad.owner !== 'blue' && squad.visible && squad.healthPercent > 0))
        .find(Boolean);
      if (this.snapshot.selectedSquadIds.length && enemy && (this.snapshot.activeAction === null || this.snapshot.activeAction === 'attack')) {
        this.onAttackSelected(enemy.id);
        return;
      }
      const cell = this.pointerPoint(pointer);
      if (!cell) return;
      // A right click on the visible rival base orders an assault on it.
      const rivalBase = this.snapshot.enemyBase;
      if (rivalBase?.visible && this.snapshot.selectedSquadIds.length && (this.snapshot.activeAction === null || this.snapshot.activeAction === 'attack')
        && Math.max(Math.abs(cell.x - rivalBase.x), Math.abs(cell.y - rivalBase.y)) <= 1.5) {
        this.onAttackSelected(rivalBase.id);
        return;
      }
      if ((this.snapshot.activeAction === null || this.snapshot.activeAction === 'move') && this.snapshot.selectedSquadIds.length) {
        this.onMoveSelected(cell.x, cell.y);
        this.orderedCell = { x: Math.round(cell.x), y: Math.round(cell.y) };
      }
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.selectionDrag && pointer.leftButtonDown()) {
        this.selectionDrag.current = this.pointerPosition(pointer);
        this.drawSelectionBox();
        return;
      }
      if ((this.snapshot.activeAction === null || this.snapshot.activeAction === 'move') && !this.dragOrigin) {
        const cell = this.pointerPoint(pointer);
        if (cell?.x !== this.hoverPoint?.x || cell?.y !== this.hoverPoint?.y) {
          this.hoverPoint = cell;
          this.drawRoute();
        }
      }
      if (!this.dragOrigin || !pointer.middleButtonDown()) return;
      const position = this.pointerPosition(pointer);
      const camera = this.cameras.main;
      camera.scrollX = this.dragOrigin.scrollX - (position.x - this.dragOrigin.x) / camera.zoom;
      camera.scrollY = this.dragOrigin.scrollY - (position.y - this.dragOrigin.y) / camera.zoom;
      this.refreshCameraView();
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, (pointer: Phaser.Input.Pointer) => {
      if (this.selectionDrag) {
        const { start, clickedId } = this.selectionDrag;
        const end = this.pointerPosition(pointer);
        const dragged = Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) >= 6;
        if (dragged) {
          const a = this.cameras.main.getWorldPoint(Math.min(start.x, end.x), Math.min(start.y, end.y));
          const b = this.cameras.main.getWorldPoint(Math.max(start.x, end.x), Math.max(start.y, end.y));
          const ids = this.snapshot.squads.filter((squad) => squad.owner === 'blue' && squad.visible && squad.healthPercent > 0)
            .filter((squad) => { const point = cellToIso(squad.gridX, squad.gridY); return point.x >= a.x && point.x <= b.x && point.y >= a.y && point.y <= b.y; })
            .map((squad) => squad.id);
          this.onSelectSquads(ids);
        } else if (clickedId && this.lastClick?.id === clickedId && pointer.downTime - this.lastClick.at <= DOUBLE_CLICK_MS) {
          // Double click selects the whole class on screen; further quick clicks keep that group.
          if (!this.lastClick.group) this.onSelectSquads(this.sameTypeOnScreen(clickedId));
          this.lastClick = { id: clickedId, at: pointer.downTime, group: true };
        } else {
          this.onSelectSquads(clickedId ? [clickedId] : []);
          this.lastClick = clickedId ? { id: clickedId, at: pointer.downTime, group: false } : null;
        }
        this.selectionDrag = undefined;
        this.drawSelectionBox();
      }
      this.dragOrigin = undefined;
    });
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      // The wheel sets a goal; update() glides there keeping the point under the cursor still.
      const limits = this.zoomLimits();
      this.zoomTarget = Phaser.Math.Clamp(this.zoomTarget - deltaY * 0.001, limits.min, limits.max);
      this.zoomAnchor = this.pointerPosition(pointer);
    });
  }
}

/** Texture of a structure image (a file of `tilesets/img`) by its name without extension. */
function structureKey(name: string): string | null {
  for (const tileset of sectorMap.tilesets) {
    const tile = tileset.tiles?.find((candidate) => candidate.image?.split('/').pop() === `${name}.png`);
    if (tile) return textureKey(tileset, tile.id);
  }
  return null;
}

/** A ground tile exactly the size of a cell, so it cannot stick out from under another. */
function isFlat(tileset: Tileset): boolean {
  return !!tileset.image && tileset.tilewidth === TILE_WIDTH && tileset.tileheight === TILE_HALF_HEIGHT * 2 && !tileset.tileoffset;
}

function tilesetFor(gid: number): Tileset | undefined {
  return [...sectorMap.tilesets].reverse().find((set) => set.firstgid <= gid);
}

/** Texture key of a strip tileset, or of one image tile inside a collection tileset. */
function textureKey(tileset: Tileset, tile?: number): string | null {
  if (tile === undefined) return tileset.image ? `${activeMapId}:${tileset.firstgid}` : null;
  return tileset.image ? null : `${activeMapId}:${tileset.firstgid}:${tile}`;
}
