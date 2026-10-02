import Phaser from 'phaser';
import type { CameraView, CoreState, GameplayViewModel, SquadViewModel } from '../model';
import type { GridPoint } from './grid';
import { planSectorMove, sectorMap, sectorSurface } from '../../map/sector-map';
import atlasUrl from '../../../../../../packages/sim/src/tiled-maps/sector-01 aaaa/stellar-plataformas.png';
import { cellToIso, isoToPoint, ISO_WORLD_HEIGHT, ISO_WORLD_WIDTH, TILE_HALF_HEIGHT } from './isometric';

const GRID_COLUMNS = sectorMap.width;
/** Multiplicative tint for tiles outside vision: dark, but the terrain stays readable. */
const FOG_TINT = 0x4a5566;
/** Camera zoom limits: the farthest view still frames a fight; a little closer for detail. */
export const ZOOM_DEFAULT = 1.5;
export const ZOOM_MIN = 1.5;
export const ZOOM_MAX = 2;
const GRID_ROWS = sectorMap.height;
const CORE_CELL = sectorSurface.core;

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

interface UnitVisual {
  container: Phaser.GameObjects.Container;
  selection: Phaser.GameObjects.Graphics;
  hull: Phaser.GameObjects.Graphics;
  hitFlash: Phaser.GameObjects.Graphics;
  health: Phaser.GameObjects.Rectangle;
  healthPercent: number;
  gridX: number;
  gridY: number;
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
  private selectionBox?: Phaser.GameObjects.Graphics;
  private core?: Phaser.GameObjects.Graphics;
  private nodeMarks?: Phaser.GameObjects.Graphics;
  /** Terrain images per cell, so fog can tint the real tile art instead of painting over it. */
  private tileImages: Phaser.GameObjects.Image[][] = [];
  private fogShown: boolean[] | null = null;
  private created = false;
  private readonly unitVisuals = new Map<string, UnitVisual>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private dragOrigin?: { x: number; y: number; scrollX: number; scrollY: number };
  private selectionDrag?: { start: { x: number; y: number }; current: { x: number; y: number }; clickedId: string | null };
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
    this.load.spritesheet('sector-atlas', atlasUrl, { frameWidth: 64, frameHeight: 48 });
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, () => this.onError('No se pudo cargar el atlas de Sector 01.'));
  }

  create() {
    if (sectorMap.orientation !== 'isometric' || !this.textures.exists('sector-atlas')) {
      this.onError('El mapa del sector no tiene el tamaño esperado.');
      return;
    }
    this.scale.refresh();
    this.cameras.main.setBackgroundColor(color.background);
    // Margin so a base on the map edge can still be centred below the HUD panels.
    const margin = 360;
    this.cameras.main.setBounds(-margin, -margin, ISO_WORLD_WIDTH + margin * 2, ISO_WORLD_HEIGHT + margin * 2);
    this.terrain = this.add.graphics().setDepth(0);
    this.route = this.add.graphics().setDepth(20000);
    this.selectionBox = this.add.graphics().setScrollFactor(0).setDepth(30000);
    this.core = this.add.graphics().setDepth(20001);
    this.nodeMarks = this.add.graphics().setDepth(15000);

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
    });
  }

  update(_time: number, delta: number) {
    const camera = this.cameras.main;
    const distance = (Math.min(delta, 100) / 1000) * 650 / camera.zoom;
    const pointer = this.input.activePointer;
    const edge = this.pointerOnCanvas && !this.dragOrigin && !this.selectionDrag && pointer.x >= 0 && pointer.y >= 0
      && pointer.x < this.scale.width && pointer.y < this.scale.height;
    const cameraKey = (key: Phaser.Input.Keyboard.Key | undefined) => key?.isDown;
    const horizontal = Number(Boolean(this.cursors?.right.isDown || cameraKey(this.movementKeys?.right) || (edge && pointer.x >= this.scale.width - 20)))
      - Number(Boolean(this.cursors?.left.isDown || cameraKey(this.movementKeys?.left) || (edge && pointer.x < 20)));
    const vertical = Number(Boolean(this.cursors?.down.isDown || cameraKey(this.movementKeys?.down) || (edge && pointer.y >= this.scale.height - 20)))
      - Number(Boolean(this.cursors?.up.isDown || cameraKey(this.movementKeys?.up) || (edge && pointer.y < 20)));
    camera.scrollX += horizontal * distance;
    camera.scrollY += vertical * distance;
    this.refreshCameraView();
  }

  sync(snapshot: GameplayViewModel) {
    this.snapshot = snapshot;
    if (snapshot.activeAction !== null && snapshot.activeAction !== 'move') this.hoverPoint = null;
    if (this.sys.isActive()) this.renderSnapshot();
  }

  resetCamera() {
    this.cameras.main.setZoom(ZOOM_DEFAULT);
    const cell = cellToIso(CORE_CELL.x, CORE_CELL.y);
    this.cameras.main.centerOn(cell.x, cell.y);
    this.refreshCameraView();
  }

  /** False until Phaser has created the camera; callers may retry. */
  centerOnCell(x: number, y: number): boolean {
    const camera = this.cameras?.main;
    if (!camera || !this.created) return false;
    const cell = cellToIso(Phaser.Math.Clamp(x, 0, GRID_COLUMNS - 1), Phaser.Math.Clamp(y, 0, GRID_ROWS - 1));
    camera.centerOn(cell.x, cell.y);
    this.refreshCameraView();
    return true;
  }

  private refreshCameraView() {
    const camera = this.cameras.main;
    const cameraKey = `${Math.round(camera.scrollX)},${Math.round(camera.scrollY)},${camera.zoom},${camera.width},${camera.height}`;
    if (cameraKey === this.lastCameraView) return;
    this.lastCameraView = cameraKey;
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

  private drawTerrain() {
    const graphics = this.terrain;
    if (!graphics) return;
    sectorMap.layers.filter((layer) => layer.visible).forEach((layer, layerIndex) => {
      for (let y = 0; y < GRID_ROWS; y++) for (let x = 0; x < GRID_COLUMNS; x++) {
        const gid = layer.data[y * GRID_COLUMNS + x];
        if (!gid) continue;
        const point = cellToIso(x, y);
        const tileset = [...sectorMap.tilesets].reverse().find((set) => set.firstgid <= gid);
        if (tileset?.image === 'stellar-plataformas.png') {
          const image = this.add.image(point.x, point.y + TILE_HALF_HEIGHT - tileset.tileheight / 2,
            'sector-atlas', gid - tileset.firstgid).setDepth(layerIndex * 2000 + (x + y) * 32 + x);
          (this.tileImages[y * GRID_COLUMNS + x] ??= []).push(image);
        } else {
          graphics.fillStyle(0x0a1726, 1);
          graphics.fillRect(point.x - 32, point.y - 16, 64, 32);
        }
      }
    });
  }

  private drawCore() {
    const graphics = this.core;
    if (!graphics) return;
    const center = cellToIso(CORE_CELL.x, CORE_CELL.y);
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
      graphics.lineStyle(2, hue, 0.9);
      graphics.strokeEllipse(center.x, center.y + 9, 54, 27);
      if (node.kind === 'metal') {
        graphics.fillStyle(hue, 0.95);
        graphics.fillPoints(polygon([{ x: center.x, y: center.y - 2 }, { x: center.x + 7, y: center.y + 9 },
          { x: center.x, y: center.y + 20 }, { x: center.x - 7, y: center.y + 9 }]), true);
      }
    }
  }

  /** Darken the tile art of every cell outside the player's current vision. Only changed cells are touched. */
  private drawFog() {
    const cells = this.snapshot.visibleCells;
    const total = GRID_COLUMNS * GRID_ROWS;
    for (let index = 0; index < total; index++) {
      const visible = cells ? cells[index] === true : true;
      if (this.fogShown && this.fogShown[index] === visible) continue;
      for (const image of this.tileImages[index] ?? []) {
        if (visible) image.clearTint();
        else image.setTint(FOG_TINT);
      }
    }
    this.fogShown = Array.from({ length: total }, (_, index) => (cells ? cells[index] === true : true));
  }

  private renderSnapshot() {
    this.drawCore();
    this.drawNodes();
    this.drawFog();
    this.drawRoute();
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
      if (squad.healthPercent < visual.healthPercent) {
        visual.hitFlash.setAlpha(0.9);
        this.tweens.killTweensOf(visual.hitFlash);
        this.tweens.add({ targets: visual.hitFlash, alpha: 0, duration: 250 });
      }
      visual.healthPercent = squad.healthPercent;
      visual.health.width = 54 * squad.healthPercent / 100;
      if (visual.gridX === squad.gridX && visual.gridY === squad.gridY) continue;
      const previous = cellToIso(visual.gridX, visual.gridY);
      visual.gridX = squad.gridX;
      visual.gridY = squad.gridY;
      const point = cellToIso(squad.gridX, squad.gridY);
      visual.hull.rotation = Math.atan2(point.y - previous.y, point.x - previous.x) + Math.PI / 2;
      this.tweens.killTweensOf(visual.container);
      this.tweens.add({ targets: visual.container, x: point.x, y: point.y, duration: 50, ease: 'Linear' });
      visual.container.setDepth(16000 + point.y);
    }
  }

  private createUnit(squad: SquadViewModel): UnitVisual {
    const point = cellToIso(squad.gridX, squad.gridY);
    const allied = squad.owner === 'blue';
    const neutral = squad.owner === 'neutral';
    const primary = allied ? color.blue : neutral ? color.neutral : color.red;
    const light = allied ? color.blueLight : neutral ? color.neutralLight : color.redLight;
    const container = this.add.container(point.x, point.y).setDepth(16000 + point.y);
    const selection = this.add.graphics();
    selection.lineStyle(2, light, 0.98);
    selection.strokeEllipse(0, 9, 90, 46);
    selection.lineStyle(1, light, 0.4);
    selection.strokeEllipse(0, 9, 105, 57);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x020912, 0.7);
    shadow.fillEllipse(0, 13, 80, 30);
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
    const label = this.add.text(0, 31, squad.callSign.toUpperCase(), {
      color: allied ? '#83d4ff' : neutral ? '#f7d774' : '#ff9ba7', fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontStyle: '600', letterSpacing: 2,
    }).setOrigin(0.5, 0);
    const healthBack = this.add.rectangle(0, 51, 54, 4, color.grid).setOrigin(0.5);
    const health = this.add.rectangle(-27, 51, 54 * squad.healthPercent / 100, 4, squad.healthPercent > 35 ? 0x4ad69a : color.red).setOrigin(0, 0.5);
    container.add([selection, shadow, marker, hitFlash, label, healthBack, health]);
    container.setInteractive(new Phaser.Geom.Ellipse(0, 0, 100, 80), Phaser.Geom.Ellipse.Contains);
    container.setData('unitId', squad.id);
    const visual = { container, selection, hull: marker, hitFlash, health,
      healthPercent: squad.healthPercent, gridX: squad.gridX, gridY: squad.gridY };
    this.unitVisuals.set(squad.id, visual);
    return visual;
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
      ? planSectorMove({ x: selected.gridX, y: selected.gridY }, this.hoverPoint) : [];
    const ordered = this.snapshot.moveOrder?.squadId === selected.id ? this.snapshot.moveOrder.route : [];
    const path = preview.length > 1 ? preview : ordered;
    if (this.hoverPoint && !sectorSurface.walkable[Math.round(this.hoverPoint.y) * GRID_COLUMNS + Math.round(this.hoverPoint.x)]) {
      const blocked = cellToIso(this.hoverPoint.x, this.hoverPoint.y);
      graphics.lineStyle(2, color.red, 0.9);
      graphics.strokeEllipse(blocked.x, blocked.y, 52, 28);
      graphics.lineBetween(blocked.x - 10, blocked.y - 7, blocked.x + 10, blocked.y + 7);
      graphics.lineBetween(blocked.x + 10, blocked.y - 7, blocked.x - 10, blocked.y + 7);
    }
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
        const clickedId = over.map((object) => object.getData('unitId'))
          .find((id) => this.snapshot.squads.some((squad) => squad.id === id && squad.owner === 'blue' && squad.visible && squad.healthPercent > 0)) ?? null;
        const position = this.pointerPosition(pointer);
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
      if ((this.snapshot.activeAction === null || this.snapshot.activeAction === 'move') && this.snapshot.selectedSquadIds.length) {
        this.onMoveSelected(cell.x, cell.y);
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
        } else this.onSelectSquads(clickedId ? [clickedId] : []);
        this.selectionDrag = undefined;
        this.drawSelectionBox();
      }
      this.dragOrigin = undefined;
    });
    this.input.on(Phaser.Input.Events.POINTER_WHEEL, (pointer: Phaser.Input.Pointer, _objects: Phaser.GameObjects.GameObject[], _deltaX: number, deltaY: number) => {
      const camera = this.cameras.main;
      const position = this.pointerPosition(pointer);
      const before = camera.getWorldPoint(position.x, position.y);
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, ZOOM_MIN, ZOOM_MAX));
      const after = camera.getWorldPoint(position.x, position.y);
      camera.scrollX += before.x - after.x;
      camera.scrollY += before.y - after.y;
      this.refreshCameraView();
    });
  }
}
