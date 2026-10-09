import Phaser from 'phaser';
import { createBelt, gateAt, type BeltField, type BeltGate } from '@impulso/sim';
import { activeMapId, sectorMap, sectorSurface } from '../../map/sector-map';
import { cellToIso, TILE_HALF_HEIGHT } from './isometric';

/** Rocks sort with ships and structures; the warning sits on the ground and its sign in the sky. */
const DEPTH = { ground: 90004, rocks: 100000, sign: 290000 } as const;
const hue = { warning: 0xffb347, sign: 0xffd166 } as const;
const FOG_TINT = 0x4a5566;
/** Cells the rocks drift sideways while they arrive or leave, and the ticks they take to clear a passage. */
const DRIFT_CELLS = 3;
const LEAVE_TICKS = 15;
/** Passages smaller than this close without a sign of their own. */
const SIGN_CELLS = 4;

interface GateVisual {
  gate: BeltGate;
  rocks: { image: Phaser.GameObjects.Image; x: number; y: number; index: number }[];
  ground: Phaser.GameObjects.Graphics;
  sign: Phaser.GameObjects.Text | null;
  countdown: number;
}

/**
 * The asteroid belt over the map's passages. Whether a passage is clear is a pure function of the tick,
 * the same one the server opens and closes it with, so the rocks glide between server views.
 */
export class BeltEffects {
  private readonly field?: BeltField;
  private readonly visuals: GateVisual[] = [];

  constructor(private readonly scene: Phaser.Scene, tickRate: number) {
    this.field = createBelt(sectorSurface.belt, sectorSurface, tickRate);
    const rocks = sectorMap.tilesets.find((tileset) => tileset.name === 'asteroides');
    const texture = rocks?.image ? `${activeMapId}:${rocks.firstgid}` : null;
    if (!this.field || !rocks || !texture || !scene.textures.exists(texture)) return;
    const frames = scene.textures.get(texture).frameTotal - 1;
    for (const gate of this.field.gates) {
      const centre = cellToIso(gate.cells.reduce((sum, cell) => sum + cell.x, 0) / gate.cells.length,
        gate.cells.reduce((sum, cell) => sum + cell.y, 0) / gate.cells.length);
      this.visuals.push({
        gate, countdown: -1,
        rocks: gate.cells.map((cell) => ({
          x: cell.x, y: cell.y, index: cell.y * sectorMap.width + cell.x,
          image: scene.add.image(0, 0, texture, (cell.x * 7 + cell.y * 13) % frames).setOrigin(0.5, 1).setVisible(false),
        })),
        ground: scene.add.graphics().setDepth(DEPTH.ground),
        sign: gate.cells.length < SIGN_CELLS ? null : scene.add.text(centre.x, centre.y - 46, '', {
          color: '#ffd166', fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontStyle: '700', stroke: '#1a1206', strokeThickness: 4,
        }).setOrigin(0.5, 1).setDepth(DEPTH.sign).setVisible(false),
      });
    }
  }

  /** Cells of the passages: their static asteroid art is left out, these rocks replace it. */
  static cells(): Set<number> {
    return new Set((sectorSurface.belt ?? []).flatMap((gate) => gate.cells.map((cell) => cell.y * sectorMap.width + cell.x)));
  }

  /** `tick` is the server tick plus the fraction elapsed since it arrived. */
  update(tick: number, tickRate: number, inSight: (index: number) => boolean): void {
    const seconds = this.scene.time.now / 1000;
    for (const visual of this.visuals) {
      const { gate, ground, sign } = visual;
      const state = gateAt(gate, tick);
      const sinceClear = tick - Math.floor(tick / gate.cycleTicks) * gate.cycleTicks;
      // Arriving rocks slide in from one side during the warning; leaving ones slide out the other.
      const arriving = state.phase === 'warning' ? 1 - (state.phaseEndsAt - tick) / Math.max(1, gate.warningTicks) : 0;
      const leaving = state.phase === 'open' ? Math.min(1, sinceClear / LEAVE_TICKS) : 1;
      const presence = state.phase === 'closed' ? 1 : state.phase === 'warning' ? arriving : 1 - leaving;
      const slide = state.phase === 'closed' ? 0 : state.phase === 'warning' ? -(1 - arriving) * DRIFT_CELLS : leaving * DRIFT_CELLS;
      for (const [order, rock] of visual.rocks.entries()) {
        if (presence <= 0.01) { rock.image.setVisible(false); continue; }
        const point = cellToIso(rock.x + slide, rock.y - slide);
        const bob = Math.sin(seconds * 1.2 + order * 1.7) * 2;
        rock.image.setVisible(true).setAlpha(presence).setPosition(point.x, point.y + TILE_HALF_HEIGHT + bob)
          .setDepth(DEPTH.rocks + point.y + TILE_HALF_HEIGHT);
        if (inSight(rock.index)) rock.image.clearTint(); else rock.image.setTint(FOG_TINT);
      }
      ground.clear();
      if (state.phase !== 'warning') { sign?.setVisible(false); visual.countdown = -1; continue; }
      const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * (3 + 6 * arriving));
      for (const rock of visual.rocks) {
        const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]
          .map(([dx, dy]) => { const point = cellToIso(rock.x + dx!, rock.y + dy!); return new Phaser.Math.Vector2(point.x, point.y); });
        ground.fillStyle(hue.warning, 0.1 + 0.18 * pulse).fillPoints(corners, true);
        ground.lineStyle(1, hue.warning, 0.4 + 0.5 * pulse).strokePoints(corners, true);
      }
      if (!sign) continue;
      const left = Math.max(0, Math.ceil((state.phaseEndsAt - tick) / tickRate));
      if (left !== visual.countdown) { visual.countdown = left; sign.setText(`⚠ CINTURÓN ${left}`); }
      sign.setVisible(true).setAlpha(0.65 + 0.35 * pulse);
    }
  }

  destroy(): void {
    for (const visual of this.visuals) {
      for (const rock of visual.rocks) rock.image.destroy();
      visual.ground.destroy();
      visual.sign?.destroy();
    }
    this.visuals.length = 0;
  }
}
