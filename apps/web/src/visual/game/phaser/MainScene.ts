import Phaser from 'phaser';
import type { CameraView } from '../model';
import { CELL_SIZE, CORE_CELL } from './grid';
import mapUrl from './assets/battlefield.json?url';
const tilesetUrl = `${import.meta.env.BASE_URL}visual/maps/terrain.svg`;

const EDGE_SIZE = 20;
const PAN_SPEED = 650; // Screen pixels per second, independent of frame rate and zoom.

export class MainScene extends Phaser.Scene {
  private mapWidth = 0;
  private mapHeight = 0;
  private lastCameraView = '';

  constructor(
    private readonly onCameraChange: (view: CameraView) => void,
    private readonly onReady: () => void,
    private readonly onError: (message: string) => void,
  ) {
    super({ key: 'MainScene' });
  }

  preload() {
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.onError(`No se pudo cargar el recurso del mapa: ${file.key}`);
    });
    this.load.tilemapTiledJSON('battlefield', mapUrl);
    this.load.svg('terrain', tilesetUrl);
  }

  create() {
    if (!this.cache.tilemap.exists('battlefield') || !this.textures.exists('terrain')) {
      this.onError('Faltan el mapa o el tileset del campo.');
      return;
    }
    const map = this.make.tilemap({ key: 'battlefield' });
    // Phaser 4's Tiled parser stores an orientation constant, although its
    // public Tilemap type still describes this property as a string.
    if ((map.orientation !== 'orthogonal' && Number(map.orientation) !== Phaser.Tilemaps.ORTHOGONAL)
      || map.tileWidth !== CELL_SIZE || map.tileHeight !== CELL_SIZE) {
      this.onError('El mapa de Tiled debe usar casillas ortogonales cuadradas de 72 px.');
      return;
    }

    const tileset = map.addTilesetImage('terrain', 'terrain', CELL_SIZE, CELL_SIZE);
    if (!tileset || !map.createLayer('Terreno', tileset, 0, 0)) {
      this.onError('No se pudo cargar la capa Terreno del mapa.');
      return;
    }

    this.mapWidth = map.widthInPixels;
    this.mapHeight = map.heightInPixels;
    const camera = this.cameras.main;
    camera.setBackgroundColor('#080e18');
    camera.setBounds(0, 0, this.mapWidth, this.mapHeight);
    this.resetCamera();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.emitCameraView, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.emitCameraView, this);
    });
    this.onReady();
  }

  update(_time: number, delta: number) {
    if (!this.mapWidth || !this.input.manager.isOver) return;

    const pointer = this.input.activePointer;
    // Phaser starts at (0, 0) with isOver=true before receiving pointer input.
    // Do not mistake that initial state for hovering over the top-left edge.
    if (!pointer.event) return;
    const { width, height } = this.scale;
    const x = pointer.x;
    const y = pointer.y;
    if (x < 0 || y < 0 || x >= width || y >= height) return;

    const camera = this.cameras.main;
    const distance = PAN_SPEED * Math.min(delta, 100) / 1000 / camera.zoom;
    const horizontal = (x >= width - EDGE_SIZE ? 1 : 0) - (x < EDGE_SIZE ? 1 : 0);
    const vertical = (y >= height - EDGE_SIZE ? 1 : 0) - (y < EDGE_SIZE ? 1 : 0);
    if (horizontal || vertical) {
      camera.scrollX += horizontal * distance;
      camera.scrollY += vertical * distance;
    }
    this.emitCameraView();
  }

  resetCamera() {
    if (!this.mapWidth) return;
    this.cameras.main.setZoom(1);
    this.centerOnCell(CORE_CELL.x, CORE_CELL.y);
  }

  centerOnCell(x: number, y: number) {
    if (!this.mapWidth) return;
    const camera = this.cameras.main;
    const column = Phaser.Math.Clamp(x, 0, this.mapWidth / CELL_SIZE - 1);
    const row = Phaser.Math.Clamp(y, 0, this.mapHeight / CELL_SIZE - 1);
    camera.centerOn((column + 0.5) * CELL_SIZE, (row + 0.5) * CELL_SIZE);
    this.emitCameraView();
  }

  private emitCameraView() {
    if (!this.mapWidth) return;
    const camera = this.cameras.main;
    const visibleWidth = camera.width / camera.zoom;
    const visibleHeight = camera.height / camera.zoom;
    const x = Phaser.Math.Clamp(camera.scrollX, 0, Math.max(0, this.mapWidth - visibleWidth));
    const y = Phaser.Math.Clamp(camera.scrollY, 0, Math.max(0, this.mapHeight - visibleHeight));
    const cameraKey = `${Math.round(x)},${Math.round(y)},${Math.round(visibleWidth)},${Math.round(visibleHeight)}`;
    if (cameraKey === this.lastCameraView) return;
    this.lastCameraView = cameraKey;
    this.onCameraChange({ x: x / this.mapWidth, y: y / this.mapHeight, width: visibleWidth / this.mapWidth, height: visibleHeight / this.mapHeight });
  }
}
