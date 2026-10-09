import Phaser from 'phaser';
import { Visibility } from '../src/fog-of-war';
import { tileFromIndex, type GridSize } from '../src/grid';
import { tileToWorld, type IsoLayout } from './iso-projection';

export const FOG_TEXTURE_KEY = 'niebla';
export const VISION_BRUSH_KEY = 'pincel-vision';

const EXPLORED_CLEAR_ALPHA = 0.55;
/** El pincel también despeja lo que sobresale hacia arriba (naves y estructuras). */
const BRUSH_ORIGIN_Y = 96 / 128;
const FOG_DEPTH = 1_000_000;

export function preloadFog(scene: Phaser.Scene, basePath: string): void {
  scene.load.image(FOG_TEXTURE_KEY, `${basePath}/niebla.png`);
  scene.load.image(VISION_BRUSH_KEY, `${basePath}/pincel_vision.png`);
}

/** Dibuja la niebla de un jugador a partir de FogOfWar.snapshot(). Solo redibuja si algo cambió. */
export class FogRenderer {
  private readonly texture: Phaser.GameObjects.RenderTexture;
  private readonly fogPattern: Phaser.GameObjects.TileSprite;
  private readonly brush: Phaser.GameObjects.Image;
  private lastCells: Uint8Array | undefined;

  constructor(scene: Phaser.Scene, private readonly layout: IsoLayout, private readonly size: GridSize) {
    const width = ((size.width + size.height) * layout.tileWidth) / 2;
    const height = ((size.width + size.height) * layout.tileHeight) / 2;
    this.texture = scene.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setDepth(FOG_DEPTH);
    this.fogPattern = scene.make.tileSprite({ x: 0, y: 0, width, height, key: FOG_TEXTURE_KEY }, false).setOrigin(0, 0);
    this.brush = scene.make.image({ key: VISION_BRUSH_KEY }, false).setOrigin(0.5, BRUSH_ORIGIN_Y);
  }

  render(cells: Uint8Array): void {
    if (this.lastCells && this.isSame(cells, this.lastCells)) return;
    this.lastCells = cells.slice();
    this.texture.clear();
    this.texture.draw(this.fogPattern);
    this.clearCells(cells, Visibility.Explored, EXPLORED_CLEAR_ALPHA);
    this.clearCells(cells, Visibility.Visible, 1);
  }

  destroy(): void {
    this.texture.destroy();
    this.fogPattern.destroy();
    this.brush.destroy();
  }

  private clearCells(cells: Uint8Array, state: Visibility, alpha: number): void {
    this.brush.setAlpha(alpha);
    cells.forEach((cell, index) => {
      if (cell !== state) return;
      const center = tileToWorld(this.layout, tileFromIndex(this.size, index));
      this.brush.setPosition(center.x, center.y);
      this.texture.erase(this.brush);
    });
  }

  private isSame(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((value, index) => value === b[index]);
  }
}
