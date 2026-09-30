import Phaser from 'phaser';
import type { CameraView, CoreState, GameplayViewModel, SquadViewModel } from '../model';
import { CORE_CELL, GRID_COLUMNS, GRID_ROWS, type GridPoint } from './grid';
import { planFreeMove } from './free-movement';
import { ASTEROIDS, BASE_CELLS, BLOCKING_TERRAIN } from './asteroids';
import { cellToIso, isoToPoint, ISO_WORLD_HEIGHT, ISO_WORLD_WIDTH, TILE_HALF_HEIGHT, TILE_HALF_WIDTH } from './isometric';
import mapData from './assets/battlefield.json';

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

function terrainVariant(x: number, y: number) {
  return ((x * 73856093) ^ (y * 19349663)) >>> 0;
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
  private bases?: Phaser.GameObjects.Graphics;
  private readonly unitVisuals = new Map<string, UnitVisual>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private dragOrigin?: { x: number; y: number; scrollX: number; scrollY: number };
  private selectionDrag?: { start: { x: number; y: number }; current: { x: number; y: number }; clickedId: string | null };
  private hoverPoint: GridPoint | null = null;
  private lastTerrainBounds = '';
  private lastCameraView = '';
  private pointerOnCanvas = false;
  private readonly asteroidIds = new Set(ASTEROIDS.map((point) => `${point.x},${point.y}`));

  constructor(
    snapshot: GameplayViewModel,
    onSelectSquads: (squadIds: string[]) => void,
    onMoveSelected: (x: number, y: number) => void,
    onAttackSelected: (targetId: string) => void,
    onCameraChange: (view: CameraView) => void,
    onReady: () => void,
    private readonly onError: (message: string) => void,
    private readonly isActionKey: (key: string) => boolean,
  ) {
    super({ key: 'MainScene' });
    this.snapshot = snapshot;
    this.onSelectSquads = onSelectSquads;
    this.onMoveSelected = onMoveSelected;
    this.onAttackSelected = onAttackSelected;
    this.onCameraChange = onCameraChange;
    this.onReady = onReady;
  }

  create() {
    if (mapData.orientation !== 'orthogonal' || mapData.width !== GRID_COLUMNS || mapData.height !== GRID_ROWS
      || mapData.layers[0]?.data.length !== GRID_COLUMNS * GRID_ROWS) {
      this.onError('El mapa del sector no tiene el tamaño esperado.');
      return;
    }
    this.scale.refresh();
    this.cameras.main.setBackgroundColor(color.background);
    this.cameras.main.setBounds(0, 0, ISO_WORLD_WIDTH, ISO_WORLD_HEIGHT);
    this.terrain = this.add.graphics().setDepth(0);
    this.route = this.add.graphics().setDepth(20000);
    this.selectionBox = this.add.graphics().setScrollFactor(0).setDepth(30000);
    this.core = this.add.graphics().setDepth(20001);
    this.bases = this.add.graphics().setDepth(50);
    this.drawBases();
    this.drawCore();
    this.renderSnapshot();
    this.configureInput();
    const canvas = this.game.canvas;
    const onPointerMove = (event: PointerEvent) => { this.pointerOnCanvas = event.target === canvas; };
    window.addEventListener('pointermove', onPointerMove);
    this.resetCamera();
    this.refreshCameraView();
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
    const cameraKey = (key: Phaser.Input.Keyboard.Key | undefined, binding: string) => key?.isDown && !this.isActionKey(binding);
    const horizontal = Number(Boolean(this.cursors?.right.isDown || cameraKey(this.movementKeys?.right, 'D') || (edge && pointer.x >= this.scale.width - 20)))
      - Number(Boolean(this.cursors?.left.isDown || cameraKey(this.movementKeys?.left, 'A') || (edge && pointer.x < 20)));
    const vertical = Number(Boolean(this.cursors?.down.isDown || cameraKey(this.movementKeys?.down, 'S') || (edge && pointer.y >= this.scale.height - 20)))
      - Number(Boolean(this.cursors?.up.isDown || cameraKey(this.movementKeys?.up, 'W') || (edge && pointer.y < 20)));
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
    this.cameras.main.setZoom(1);
    this.centerOnCell(CORE_CELL.x, CORE_CELL.y);
  }

  centerOnCell(x: number, y: number) {
    const cell = cellToIso(Phaser.Math.Clamp(x, 0, GRID_COLUMNS - 1), Phaser.Math.Clamp(y, 0, GRID_ROWS - 1));
    this.cameras.main.centerOn(cell.x, cell.y);
    this.refreshCameraView();
  }

  private refreshCameraView() {
    const camera = this.cameras.main;
    const corners = [camera.getWorldPoint(0, 0), camera.getWorldPoint(camera.width, 0),
      camera.getWorldPoint(0, camera.height), camera.getWorldPoint(camera.width, camera.height)];
    const grid = corners.map(({ x, y }) => {
      const dx = (x - GRID_ROWS * TILE_HALF_WIDTH) / TILE_HALF_WIDTH;
      const dy = (y - 72) / TILE_HALF_HEIGHT;
      return { x: (dx + dy) / 2, y: (dy - dx) / 2 };
    });
    const terrainBounds: [number, number, number, number] = [
      Phaser.Math.Clamp(Math.floor(Math.min(...grid.map((point) => point.x)) - 2), 0, GRID_COLUMNS - 1),
      Phaser.Math.Clamp(Math.floor(Math.min(...grid.map((point) => point.y)) - 2), 0, GRID_ROWS - 1),
      Phaser.Math.Clamp(Math.ceil(Math.max(...grid.map((point) => point.x)) + 2), 0, GRID_COLUMNS - 1),
      Phaser.Math.Clamp(Math.ceil(Math.max(...grid.map((point) => point.y)) + 2), 0, GRID_ROWS - 1),
    ];
    const terrainKey = terrainBounds.join(',');
    if (terrainKey !== this.lastTerrainBounds) {
      this.lastTerrainBounds = terrainKey;
      this.drawTerrain(terrainBounds);
    }
    const cameraKey = terrainKey;
    if (cameraKey === this.lastCameraView) return;
    this.lastCameraView = cameraKey;
    const [minX, minY, maxX, maxY] = terrainBounds;
    this.onCameraChange({
      x: minX / GRID_COLUMNS, y: minY / GRID_ROWS,
      width: Math.min(1 - minX / GRID_COLUMNS, (maxX - minX + 1) / GRID_COLUMNS),
      height: Math.min(1 - minY / GRID_ROWS, (maxY - minY + 1) / GRID_ROWS),
    });
  }

  private drawTerrain([minX, minY, maxX, maxY]: [number, number, number, number]) {
    const graphics = this.terrain;
    if (!graphics) return;
    graphics.clear();
    for (let sum = minX + minY; sum <= maxX + maxY; sum += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const y = sum - x;
        if (y < minY || y > maxY) continue;
        const variant = terrainVariant(x, y);
        const tile = mapData.layers[0]!.data[y * GRID_COLUMNS + x];
        const tileColor = tile === 2 ? 0x1b334b : tile === 3 ? 0x102438 : tile === 4 ? 0x20374c : 0x172c40;
        const point = cellToIso(x, y);
        const rise = tile === 4 ? 8 : tile === 2 ? 5 : 3;
        graphics.fillStyle(0x081521, 1);
        graphics.fillPoints(polygon([
          { x: point.x, y: point.y + TILE_HALF_HEIGHT }, { x: point.x + TILE_HALF_WIDTH, y: point.y },
          { x: point.x + TILE_HALF_WIDTH, y: point.y + rise }, { x: point.x, y: point.y + TILE_HALF_HEIGHT + rise },
        ]), true);
        graphics.fillStyle(0x0d2030, 1);
        graphics.fillPoints(polygon([
          { x: point.x - TILE_HALF_WIDTH, y: point.y }, { x: point.x, y: point.y + TILE_HALF_HEIGHT },
          { x: point.x, y: point.y + TILE_HALF_HEIGHT + rise }, { x: point.x - TILE_HALF_WIDTH, y: point.y + rise },
        ]), true);
        graphics.fillStyle(tileColor, 1);
        graphics.fillPoints(polygon([
          { x: point.x, y: point.y - TILE_HALF_HEIGHT }, { x: point.x + TILE_HALF_WIDTH, y: point.y },
          { x: point.x, y: point.y + TILE_HALF_HEIGHT }, { x: point.x - TILE_HALF_WIDTH, y: point.y },
        ]), true);
        graphics.lineStyle(1, (x + y) % 8 === 0 ? 0x54708a : 0x38556b, (x + y) % 8 === 0 ? 0.68 : 0.36);
        graphics.strokePoints(polygon([
          { x: point.x, y: point.y - TILE_HALF_HEIGHT }, { x: point.x + TILE_HALF_WIDTH, y: point.y },
          { x: point.x, y: point.y + TILE_HALF_HEIGHT }, { x: point.x - TILE_HALF_WIDTH, y: point.y },
        ]), true);
        if (this.asteroidIds.has(`${x},${y}`)) {
          graphics.fillStyle(0x536879, 1);
          graphics.fillPoints(polygon([
            { x: point.x - 24, y: point.y - 5 }, { x: point.x - 12, y: point.y - 31 },
            { x: point.x + 7, y: point.y - 40 }, { x: point.x + 25, y: point.y - 13 },
            { x: point.x + 15, y: point.y + 4 }, { x: point.x - 12, y: point.y + 8 },
          ]), true);
          graphics.lineStyle(2, 0x9dafb8, 0.8);
          graphics.lineBetween(point.x - 12, point.y - 31, point.x + 7, point.y - 40);
        }
        if (variant % 29 === 0 && Math.abs(x - CORE_CELL.x) + Math.abs(y - CORE_CELL.y) > 4) {
          graphics.lineStyle(2, 0x87a7bb, 0.34);
          graphics.lineBetween(point.x - 12, point.y - 2, point.x + 3, point.y - 9);
        }
      }
    }
  }

  private drawCore() {
    const graphics = this.core;
    if (!graphics) return;
    const center = cellToIso(CORE_CELL.x, CORE_CELL.y);
    const hue = coreColor(this.snapshot.core.state);
    graphics.clear();
    graphics.fillStyle(0x071420, 0.8);
    graphics.fillEllipse(center.x, center.y + 14, 212, 90);
    graphics.lineStyle(3, hue, 0.84);
    graphics.strokeEllipse(center.x, center.y + 9, 176, 74);
    graphics.lineStyle(1, hue, 0.35);
    graphics.strokeEllipse(center.x, center.y + 9, 220, 100);
    graphics.fillStyle(0x334a55, 1);
    graphics.fillPoints(polygon([
      { x: center.x, y: center.y - 59 }, { x: center.x + 36, y: center.y - 20 },
      { x: center.x, y: center.y + 20 }, { x: center.x - 36, y: center.y - 20 },
    ]), true);
    graphics.fillStyle(hue, 0.95);
    graphics.fillPoints(polygon([
      { x: center.x, y: center.y - 66 }, { x: center.x + 15, y: center.y - 23 },
      { x: center.x, y: center.y - 9 }, { x: center.x - 15, y: center.y - 23 },
    ]), true);
    if (this.snapshot.core.progress > 0 && this.snapshot.core.state !== 'locked') {
      graphics.lineStyle(4, hue, 1);
      graphics.beginPath();
      graphics.arc(center.x, center.y + 9, 49, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.snapshot.core.progress / 100);
      graphics.strokePath();
    }
  }

  private drawBases() {
    const graphics = this.bases;
    if (!graphics) return;
    graphics.clear();
    for (const [owner, cell] of Object.entries(BASE_CELLS)) {
      const point = cellToIso(cell.x, cell.y);
      const hue = owner === 'blue' ? color.blue : color.red;
      graphics.fillStyle(0x071420, 0.9);
      graphics.fillEllipse(point.x, point.y + 24, 340, 128);
      graphics.lineStyle(4, hue, 0.9);
      graphics.strokeEllipse(point.x, point.y + 18, 310, 108);
      graphics.lineStyle(2, hue, 0.45);
      graphics.strokeEllipse(point.x, point.y + 18, 245, 80);
      graphics.fillStyle(owner === 'blue' ? 0x244c69 : 0x6a3442, 1);
      graphics.fillPoints(polygon([
        { x: point.x, y: point.y - 86 }, { x: point.x + 48, y: point.y - 16 },
        { x: point.x, y: point.y + 27 }, { x: point.x - 48, y: point.y - 16 },
      ]), true);
      graphics.fillStyle(hue, 1);
      graphics.fillTriangle(point.x, point.y - 78, point.x + 13, point.y - 25, point.x - 13, point.y - 25);
      for (const offset of [-103, 103]) {
        const towerX = point.x + offset;
        graphics.fillStyle(0x081b2c, 1);
        graphics.fillEllipse(towerX, point.y + 14, 68, 32);
        graphics.fillStyle(owner === 'blue' ? 0x244c69 : 0x6a3442, 1);
        graphics.fillPoints(polygon([
          { x: towerX - 23, y: point.y + 7 }, { x: towerX - 17, y: point.y - 55 },
          { x: towerX, y: point.y - 68 }, { x: towerX + 17, y: point.y - 55 },
          { x: towerX + 23, y: point.y + 7 },
        ]), true);
        graphics.lineStyle(3, hue, 1);
        graphics.strokeLineShape(new Phaser.Geom.Line(towerX, point.y - 67, towerX, point.y - 91));
        graphics.fillStyle(hue, 1);
        graphics.fillCircle(towerX, point.y - 70, 8);
      }
      this.add.text(point.x, point.y + 91, owner === 'blue' ? 'BASE AZUL' : 'BASE ROJA', {
        color: owner === 'blue' ? '#83d4ff' : '#ff9ba7', fontFamily: 'Rajdhani, sans-serif', fontSize: '19px', fontStyle: '700', letterSpacing: 2,
      }).setOrigin(0.5, 0).setDepth(51);
    }
  }

  private renderSnapshot() {
    this.drawCore();
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
      visual.container.setDepth(100 + point.y);
    }
  }

  private createUnit(squad: SquadViewModel): UnitVisual {
    const point = cellToIso(squad.gridX, squad.gridY);
    const allied = squad.owner === 'blue';
    const primary = allied ? color.blue : color.red;
    const light = allied ? color.blueLight : color.redLight;
    const container = this.add.container(point.x, point.y).setDepth(100 + point.y);
    const selection = this.add.graphics();
    selection.lineStyle(2, light, 0.98);
    selection.strokeEllipse(0, 9, 90, 46);
    selection.lineStyle(1, light, 0.4);
    selection.strokeEllipse(0, 9, 105, 57);
    const shadow = this.add.graphics();
    shadow.fillStyle(0x020912, 0.7);
    shadow.fillEllipse(0, 13, 80, 30);
    const marker = this.add.graphics();
    marker.fillStyle(allied ? 0xa4d8e5 : 0xe1a1a9, 1);
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
      color: allied ? '#83d4ff' : '#ff9ba7', fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontStyle: '600', letterSpacing: 2,
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
      ? planFreeMove({ x: selected.gridX, y: selected.gridY }, this.hoverPoint, [...BLOCKING_TERRAIN]) : [];
    const ordered = this.snapshot.moveOrder?.squadId === selected.id ? this.snapshot.moveOrder.route : [];
    const path = preview.length > 1 ? preview : ordered;
    if (this.hoverPoint && BLOCKING_TERRAIN.some((obstacle) => Math.hypot(obstacle.x - this.hoverPoint!.x, obstacle.y - this.hoverPoint!.y) < 0.7)) {
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
    const x = Math.min(start.x, current.x);
    const y = Math.min(start.y, current.y);
    const width = Math.abs(start.x - current.x);
    const height = Math.abs(start.y - current.y);
    if (Math.max(width, height) < 6) return;
    graphics.fillStyle(color.blue, 0.12);
    graphics.fillRect(x, y, width, height);
    graphics.lineStyle(2, color.blueLight, 0.9);
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
        .map((id) => this.snapshot.squads.find((squad) => squad.id === id && squad.owner === 'red' && squad.visible && squad.healthPercent > 0))
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
      camera.setZoom(Phaser.Math.Clamp(camera.zoom - deltaY * 0.001, 0.75, 1.5));
      const after = camera.getWorldPoint(position.x, position.y);
      camera.scrollX += before.x - after.x;
      camera.scrollY += before.y - after.y;
      this.refreshCameraView();
    });
  }
}
