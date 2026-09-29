import Phaser from 'phaser';
import type { CameraView, CoreState, GameplayViewModel, SquadViewModel } from '../model';
import { buildRoute, CELL_SIZE, CORE_CELL, GRID_COLUMNS, GRID_ROWS, gridToWorld, WORLD_HEIGHT, WORLD_WIDTH, worldToGrid, type GridCell } from './grid';

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
  health: Phaser.GameObjects.Rectangle;
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

export class BattlefieldScene extends Phaser.Scene {
  private snapshot: GameplayViewModel;
  private readonly onSelectSquad: (squadId: string) => void;
  private readonly onMoveSquad: (squadId: string, x: number, y: number) => void;
  private readonly onCameraChange: (view: CameraView) => void;
  private readonly onReady: () => void;
  private terrain?: Phaser.GameObjects.Graphics;
  private route?: Phaser.GameObjects.Graphics;
  private core?: Phaser.GameObjects.Graphics;
  private units?: Phaser.GameObjects.Container;
  private readonly unitVisuals = new Map<string, UnitVisual>();
  private cursors?: Phaser.Types.Input.Keyboard.CursorKeys;
  private movementKeys?: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private dragOrigin?: { x: number; y: number; scrollX: number; scrollY: number };
  private hoverCell: GridCell | null = null;
  private lastTerrainBounds = '';
  private lastCameraView = '';

  constructor(
    snapshot: GameplayViewModel,
    onSelectSquad: (squadId: string) => void,
    onMoveSquad: (squadId: string, x: number, y: number) => void,
    onCameraChange: (view: CameraView) => void,
    onReady: () => void,
  ) {
    super({ key: 'BattlefieldScene' });
    this.snapshot = snapshot;
    this.onSelectSquad = onSelectSquad;
    this.onMoveSquad = onMoveSquad;
    this.onCameraChange = onCameraChange;
    this.onReady = onReady;
  }

  create() {
    this.scale.refresh();
    this.cameras.main.setBackgroundColor(color.background);
    this.cameras.main.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    this.terrain = this.add.graphics();
    this.route = this.add.graphics();
    this.core = this.add.graphics();
    this.units = this.add.container(0, 0);
    this.drawCore();
    this.renderSnapshot();
    this.configureInput();
    this.resetCamera();
    this.refreshCameraView();
    this.onReady();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.refreshCameraView, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.refreshCameraView, this);
      this.unitVisuals.clear();
    });
  }

  update(_time: number, delta: number) {
    const camera = this.cameras.main;
    const distance = (delta / 1000) * 650 / camera.zoom;
    if (this.cursors?.left.isDown || this.movementKeys?.left.isDown) camera.scrollX -= distance;
    if (this.cursors?.right.isDown || this.movementKeys?.right.isDown) camera.scrollX += distance;
    if (this.cursors?.up.isDown || this.movementKeys?.up.isDown) camera.scrollY -= distance;
    if (this.cursors?.down.isDown || this.movementKeys?.down.isDown) camera.scrollY += distance;
    this.refreshCameraView();
  }

  sync(snapshot: GameplayViewModel) {
    this.snapshot = snapshot;
    if (snapshot.activeAction !== 'move') this.hoverCell = null;
    if (this.sys.isActive()) this.renderSnapshot();
  }

  resetCamera() {
    this.cameras.main.setZoom(1);
    this.centerOnCell(CORE_CELL.x, CORE_CELL.y);
  }

  centerOnCell(x: number, y: number) {
    const cell = gridToWorld(Phaser.Math.Clamp(x, 0, GRID_COLUMNS - 1), Phaser.Math.Clamp(y, 0, GRID_ROWS - 1));
    this.cameras.main.centerOn(cell.x, cell.y);
    this.refreshCameraView();
  }

  private refreshCameraView() {
    const camera = this.cameras.main;
    const left = camera.scrollX;
    const top = camera.scrollY;
    const width = camera.width / camera.zoom;
    const height = camera.height / camera.zoom;
    const terrainBounds: [number, number, number, number] = [
      Math.max(0, Math.floor(left / CELL_SIZE) - 1),
      Math.max(0, Math.floor(top / CELL_SIZE) - 1),
      Math.min(GRID_COLUMNS - 1, Math.ceil((left + width) / CELL_SIZE) + 1),
      Math.min(GRID_ROWS - 1, Math.ceil((top + height) / CELL_SIZE) + 1),
    ];
    const terrainKey = terrainBounds.join(',');
    if (terrainKey !== this.lastTerrainBounds) {
      this.lastTerrainBounds = terrainKey;
      this.drawTerrain(terrainBounds);
    }
    const cameraKey = `${Math.round(left)},${Math.round(top)},${Math.round(width)},${Math.round(height)}`;
    if (cameraKey === this.lastCameraView) return;
    this.lastCameraView = cameraKey;
    this.onCameraChange({ x: left / WORLD_WIDTH, y: top / WORLD_HEIGHT, width: width / WORLD_WIDTH, height: height / WORLD_HEIGHT });
  }

  private drawTerrain([minX, minY, maxX, maxY]: [number, number, number, number]) {
    const graphics = this.terrain;
    if (!graphics) return;
    graphics.clear();
    for (let y = minY; y <= maxY; y += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const variant = terrainVariant(x, y);
        const tileColor = variant % 13 === 0 ? color.floorLight : variant % 11 === 0 ? color.floorDark : color.floor;
        graphics.fillStyle(tileColor, 1);
        graphics.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        graphics.lineStyle(1, x % 8 === 0 || y % 8 === 0 ? color.sector : color.grid, x % 8 === 0 || y % 8 === 0 ? 0.66 : 0.36);
        graphics.strokeRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
        if (variant % 29 === 0 && Math.abs(x - CORE_CELL.x) + Math.abs(y - CORE_CELL.y) > 4) {
          graphics.fillStyle(color.sector, 0.24);
          graphics.fillRect(x * CELL_SIZE + 14, y * CELL_SIZE + 18, 18, 3);
          graphics.fillRect(x * CELL_SIZE + 31, y * CELL_SIZE + 35, 11, 3);
        }
      }
    }
    graphics.lineStyle(3, color.sector, 0.8);
    graphics.strokeRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  }

  private drawCore() {
    const graphics = this.core;
    if (!graphics) return;
    const center = gridToWorld(CORE_CELL.x, CORE_CELL.y);
    const hue = coreColor(this.snapshot.core.state);
    graphics.clear();
    graphics.fillStyle(0x192338, 0.94);
    graphics.fillRect(center.x - 76, center.y - 76, 152, 152);
    graphics.lineStyle(2, hue, 0.88);
    graphics.strokeRect(center.x - 76, center.y - 76, 152, 152);
    graphics.lineStyle(1, hue, 0.28);
    graphics.strokeRect(center.x - 90, center.y - 90, 180, 180);
    for (const [dx, dy] of [[-58, -58], [58, -58], [-58, 58], [58, 58]] as [number, number][]) {
      graphics.fillStyle(hue, 0.45);
      graphics.fillRect(center.x + dx - 9, center.y + dy - 9, 18, 18);
    }
    graphics.fillStyle(hue, 0.16);
    graphics.fillCircle(center.x, center.y, 40);
    graphics.fillStyle(hue, 1);
    graphics.fillCircle(center.x, center.y, 13);
    if (this.snapshot.core.progress > 0 && this.snapshot.core.state !== 'locked') {
      graphics.lineStyle(4, hue, 1);
      graphics.beginPath();
      graphics.arc(center.x, center.y, 49, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * this.snapshot.core.progress / 100);
      graphics.strokePath();
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
      visual.health.width = 54 * squad.healthPercent / 100;
      if (visual.gridX === squad.gridX && visual.gridY === squad.gridY) continue;
      visual.gridX = squad.gridX;
      visual.gridY = squad.gridY;
      const point = gridToWorld(squad.gridX, squad.gridY);
      this.tweens.killTweensOf(visual.container);
      this.tweens.add({ targets: visual.container, x: point.x, y: point.y, duration: 210, ease: 'Sine.easeInOut' });
    }
  }

  private createUnit(squad: SquadViewModel): UnitVisual {
    const point = gridToWorld(squad.gridX, squad.gridY);
    const allied = squad.owner === 'blue';
    const primary = allied ? color.blue : color.red;
    const light = allied ? color.blueLight : color.redLight;
    const container = this.add.container(point.x, point.y);
    const selection = this.add.graphics();
    selection.lineStyle(2, light, 0.98);
    selection.strokeCircle(0, 0, 34);
    selection.lineStyle(1, light, 0.4);
    selection.strokeCircle(0, 0, 39);
    const marker = this.add.graphics();
    marker.fillStyle(color.panel, 1);
    marker.fillCircle(0, 0, 26);
    marker.lineStyle(2, light, 1);
    marker.strokeCircle(0, 0, 26);
    marker.fillStyle(primary, 1);
    if (squad.unitType === 'interceptor') {
      marker.fillTriangle(0, -17, 15, 13, 0, 7);
      marker.fillTriangle(0, -17, 0, 7, -15, 13);
    } else {
      marker.fillRect(-14, -9, 28, 19);
      marker.fillTriangle(-14, -9, 0, -17, 14, -9);
    }
    const label = this.add.text(0, 31, squad.callSign.toUpperCase(), {
      color: allied ? '#83d4ff' : '#ff9ba7', fontFamily: 'Rajdhani, sans-serif', fontSize: '15px', fontStyle: '600', letterSpacing: 2,
    }).setOrigin(0.5, 0);
    const healthBack = this.add.rectangle(0, 51, 54, 4, color.grid).setOrigin(0.5);
    const health = this.add.rectangle(-27, 51, 54 * squad.healthPercent / 100, 4, squad.healthPercent > 35 ? 0x4ad69a : color.red).setOrigin(0, 0.5);
    container.add([selection, marker, label, healthBack, health]);
    container.setSize(66, 66).setInteractive({ cursor: allied ? 'pointer' : 'default' });
    if (allied) container.on(Phaser.Input.Events.POINTER_UP, () => this.onSelectSquad(squad.id));
    this.units?.add(container);
    const visual = { container, selection, health, gridX: squad.gridX, gridY: squad.gridY };
    this.unitVisuals.set(squad.id, visual);
    return visual;
  }

  private drawRoute() {
    const graphics = this.route;
    if (!graphics) return;
    graphics.clear();
    const selected = this.snapshot.squads.find((squad) => squad.id === this.snapshot.selectedSquadId);
    if (!selected) return;
    const blocked = this.snapshot.squads.filter((squad) => squad.visible && squad.id !== selected.id)
      .map((squad) => ({ x: squad.gridX, y: squad.gridY }));
    const preview = this.snapshot.activeAction === 'move' && this.hoverCell
      ? buildRoute({ x: selected.gridX, y: selected.gridY }, this.hoverCell, blocked) : [];
    const ordered = this.snapshot.moveOrder?.squadId === selected.id ? this.snapshot.moveOrder.route : [];
    const path = preview.length > 1 ? preview : ordered;
    if (path.length < 2) return;
    const hue = preview.length > 1 ? color.blueLight : color.blue;
    graphics.lineStyle(3, hue, 0.9);
    graphics.beginPath();
    path.forEach((cell, index) => {
      const point = gridToWorld(cell.x, cell.y);
      if (index === 0) graphics.moveTo(point.x, point.y);
      else graphics.lineTo(point.x, point.y);
    });
    graphics.strokePath();
    for (const cell of path.slice(1, -1)) {
      const point = gridToWorld(cell.x, cell.y);
      graphics.fillStyle(hue, 0.85);
      graphics.fillCircle(point.x, point.y, 3);
    }
    const last = path[path.length - 1];
    if (!last) return;
    const destination = gridToWorld(last.x, last.y);
    graphics.fillStyle(hue, 0.12);
    graphics.fillRect(destination.x - 26, destination.y - 26, 52, 52);
    graphics.lineStyle(2, hue, 1);
    graphics.strokeRect(destination.x - 26, destination.y - 26, 52, 52);
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

  private pointerCell(pointer: Phaser.Input.Pointer) {
    const position = this.pointerPosition(pointer);
    const world = this.cameras.main.getWorldPoint(position.x, position.y);
    return worldToGrid(world.x, world.y);
  }

  private configureInput() {
    if (this.input.keyboard) {
      this.cursors = this.input.keyboard.createCursorKeys();
      this.movementKeys = this.input.keyboard.addKeys({ up: 'W', down: 'S', left: 'A', right: 'D' }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    }
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (pointer.rightButtonDown() || pointer.middleButtonDown()) {
        const position = this.pointerPosition(pointer);
        this.dragOrigin = { ...position, scrollX: this.cameras.main.scrollX, scrollY: this.cameras.main.scrollY };
        return;
      }
      if (!pointer.leftButtonDown() || over.length) return;
      const cell = this.pointerCell(pointer);
      if (!cell) return;
      const allied = this.snapshot.squads.find((squad) => squad.visible && squad.owner === 'blue' && squad.gridX === cell.x && squad.gridY === cell.y);
      if (allied) { this.onSelectSquad(allied.id); return; }
      if (this.snapshot.activeAction === 'move' && this.snapshot.selectedSquadId) this.onMoveSquad(this.snapshot.selectedSquadId, cell.x, cell.y);
    });
    this.input.on(Phaser.Input.Events.POINTER_MOVE, (pointer: Phaser.Input.Pointer) => {
      if (this.snapshot.activeAction === 'move' && !this.dragOrigin) {
        const cell = this.pointerCell(pointer);
        if (cell?.x !== this.hoverCell?.x || cell?.y !== this.hoverCell?.y) {
          this.hoverCell = cell;
          this.drawRoute();
        }
      }
      if (!this.dragOrigin || !(pointer.rightButtonDown() || pointer.middleButtonDown())) return;
      const position = this.pointerPosition(pointer);
      const camera = this.cameras.main;
      camera.scrollX = this.dragOrigin.scrollX - (position.x - this.dragOrigin.x) / camera.zoom;
      camera.scrollY = this.dragOrigin.scrollY - (position.y - this.dragOrigin.y) / camera.zoom;
      this.refreshCameraView();
    });
    this.input.on(Phaser.Input.Events.POINTER_UP, () => { this.dragOrigin = undefined; });
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
