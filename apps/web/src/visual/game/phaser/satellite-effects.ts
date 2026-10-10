import Phaser from 'phaser';
import satelliteSheet from '../../../../../../packages/sim/src/tiled-maps/espiral-estelar/assets-juego/satelite_caida.png?url';
import type { SatelliteViewModel } from '../model';
import { isReducedMotion } from '../../settings/accessibility-store';
import { cellToIso } from './isometric';

const TEXTURE = 'satellite-fall';
/** Sheet frames: two isometric views, then front and back. */
const FRAME = { cruise: 2, dive: 0 } as const;
const DEPTH = { ground: 90002, blast: 250000, sky: 290000 } as const;
/** Share of the warning spent crossing the sky before the dive starts. */
const CRUISE_SHARE = 0.55;
/** World pixels above the target; low enough to stay on screen at the closest zoom. */
const ALTITUDE = 210;
const hue = { warning: 0xff5a3c, sign: 0xffd166, fire: 0xffa24a, core: 0xfff1c9 };

interface FallVisual {
  fall: SatelliteViewModel;
  /** Flight direction across the screen: 1 enters from the left, -1 from the right. */
  side: 1 | -1;
  ground: Phaser.GameObjects.Graphics;
  trail: Phaser.GameObjects.Graphics;
  sign: Phaser.GameObjects.Text;
  sprite: Phaser.GameObjects.Image;
  countdown: number;
  exploded: boolean;
}

/** Warning, fly-by, dive and blast of each satellite the server announced. The damage is the server's. */
export class SatelliteEffects {
  private readonly visuals = new Map<string, FallVisual>();
  private readonly blasts = new Set<Phaser.GameObjects.Graphics>();
  constructor(private readonly scene: Phaser.Scene) {}

  static preload(scene: Phaser.Scene): void {
    scene.load.spritesheet(TEXTURE, satelliteSheet, { frameWidth: 136, frameHeight: 112 });
  }

  sync(falls: readonly SatelliteViewModel[], tick: number): void {
    const present = new Set(falls.map((fall) => fall.id));
    for (const [id, visual] of this.visuals) if (!present.has(id)) { this.release(visual); this.visuals.delete(id); }
    for (const fall of falls) {
      if (this.visuals.has(fall.id)) continue;
      const center = cellToIso(fall.x, fall.y);
      const visual: FallVisual = {
        fall, side: (fall.x + fall.y + fall.impactTick) % 2 === 0 ? 1 : -1, countdown: -1,
        // A fall first seen after its impact (reconnection) is not replayed.
        exploded: tick >= fall.impactTick,
        ground: this.scene.add.graphics().setDepth(DEPTH.ground),
        trail: this.scene.add.graphics().setDepth(DEPTH.sky),
        sign: this.scene.add.text(center.x, center.y - 34, '', {
          color: '#ffd166', fontFamily: 'Rajdhani, sans-serif', fontSize: '20px', fontStyle: '700', stroke: '#1a0906', strokeThickness: 4,
        }).setOrigin(0.5, 1).setDepth(DEPTH.sky),
        sprite: this.scene.add.image(center.x, center.y - ALTITUDE, TEXTURE, FRAME.cruise).setDepth(DEPTH.sky + 1).setVisible(false),
      };
      if (visual.exploded) this.hide(visual);
      this.visuals.set(fall.id, visual);
    }
  }

  /** `tick` is the server tick plus the fraction elapsed since it arrived. */
  update(tick: number, tickRate: number): void {
    for (const visual of this.visuals.values()) {
      if (visual.exploded) continue;
      const { fall } = visual;
      if (tick >= fall.impactTick) { this.explode(visual); continue; }
      const progress = Phaser.Math.Clamp((tick - fall.warnTick) / Math.max(1, fall.impactTick - fall.warnTick), 0, 1);
      this.drawWarning(visual, progress);
      const seconds = Math.ceil((fall.impactTick - tick) / tickRate);
      if (seconds !== visual.countdown) { visual.countdown = seconds; visual.sign.setText(`⚠ ${seconds}`); }
      this.fly(visual, progress);
    }
  }

  /** Pulsing danger area over every cell the blast will reach, with a ring that closes on impact. */
  private drawWarning(visual: FallVisual, progress: number): void {
    const { fall, ground } = visual;
    const reach = fall.radius + 0.5;
    const corners = [[-reach, -reach], [reach, -reach], [reach, reach], [-reach, reach]]
      .map(([dx, dy]) => { const point = cellToIso(fall.x + dx!, fall.y + dy!); return new Phaser.Math.Vector2(point.x, point.y); });
    const center = cellToIso(fall.x, fall.y);
    // The blink speeds up as the satellite gets closer.
    const pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now / 1000 * Math.PI * (3 + 9 * progress));
    const width = corners[1]!.x - corners[3]!.x;
    ground.clear();
    ground.fillStyle(hue.warning, 0.1 + 0.2 * pulse).fillPoints(corners, true);
    ground.lineStyle(2, hue.warning, 0.55 + 0.45 * pulse).strokePoints(corners, true);
    ground.lineStyle(2, hue.sign, 0.9).strokeEllipse(center.x, center.y, width * (1 - progress), width / 2 * (1 - progress));
    const dive = Math.max(0, (progress - CRUISE_SHARE) / (1 - CRUISE_SHARE));
    ground.fillStyle(0x020912, 0.45 * dive).fillEllipse(center.x, center.y, 24 + 56 * dive, 12 + 28 * dive);
    visual.sign.setAlpha(0.6 + 0.4 * pulse);
  }

  /** First the satellite crosses the sky above the zone, then it dives onto the marked cell. */
  private fly(visual: FallVisual, progress: number): void {
    const { fall, side, sprite, trail } = visual;
    const center = cellToIso(fall.x, fall.y);
    const diveStart = { x: center.x - side * 120, y: center.y - ALTITUDE };
    trail.clear();
    sprite.setVisible(true).setFlipX(side === -1);
    if (progress < CRUISE_SHARE) {
      const cruise = progress / CRUISE_SHARE;
      sprite.setFrame(FRAME.cruise).setScale(0.36).setRotation(0).clearTint()
        .setAlpha(Math.min(1, cruise * 6))
        .setPosition(diveStart.x - side * 330 * (1 - cruise), diveStart.y + Math.sin(cruise * Math.PI * 2) * 8);
      return;
    }
    const dive = (progress - CRUISE_SHARE) / (1 - CRUISE_SHARE);
    const eased = dive * dive;
    const x = Phaser.Math.Linear(diveStart.x, center.x, eased);
    const y = Phaser.Math.Linear(diveStart.y, center.y - 10, eased);
    sprite.setFrame(FRAME.dive).setAlpha(1).setScale(0.36 + 0.26 * dive).setRotation(side * dive * 1.9)
      .setTint(dive > 0.35 ? 0xffc9a0 : 0xffffff).setPosition(x, y);
    // Re-entry fire streaming back along the dive.
    const back = new Phaser.Math.Vector2(diveStart.x - center.x, diveStart.y - center.y).normalize();
    const length = 30 + 90 * dive;
    trail.lineStyle(9, hue.fire, 0.22 * dive).lineBetween(x, y, x + back.x * length, y + back.y * length);
    trail.lineStyle(3, hue.core, 0.75 * dive).lineBetween(x, y, x + back.x * length * 0.6, y + back.y * length * 0.6);
  }

  private explode(visual: FallVisual): void {
    visual.exploded = true;
    this.hide(visual);
    const { fall } = visual;
    const center = cellToIso(fall.x, fall.y);
    const reach = (fall.radius + 0.5) * 64;
    const camera = this.scene.cameras.main;
    if (!isReducedMotion() && camera.worldView.contains(center.x, center.y)) camera.shake(220, 0.006);
    const blast = this.scene.add.graphics().setDepth(DEPTH.blast);
    this.blasts.add(blast);
    const debris = Array.from({ length: 10 }, (_, index) => {
      const angle = index / 10 * Math.PI * 2 + (fall.impactTick % 7) * 0.3;
      return { dx: Math.cos(angle) * (reach * 0.9 + (index % 3) * 14), dy: Math.sin(angle) * (reach * 0.45 + (index % 3) * 7), lift: 26 + (index % 4) * 12 };
    });
    this.scene.tweens.addCounter({ from: 0, to: 1, duration: 700,
      onUpdate: (tween) => {
        const p = tween.getValue() ?? 0;
        const fade = 1 - p;
        blast.clear();
        // Scorch on the floor, fireball, two shock rings and sparks thrown outward.
        blast.fillStyle(0x140a08, 0.5 * fade).fillEllipse(center.x, center.y, reach * 1.1, reach * 0.55);
        blast.fillStyle(hue.fire, 0.8 * fade).fillEllipse(center.x, center.y - 10, reach * (0.5 + p), reach * (0.36 + p * 0.5));
        blast.fillStyle(hue.core, fade * fade).fillCircle(center.x, center.y - 12, 10 + 34 * (1 - p) * Math.min(1, p * 6));
        blast.lineStyle(3, hue.core, fade).strokeEllipse(center.x, center.y, reach * 2.2 * p, reach * 1.1 * p);
        blast.lineStyle(2, hue.warning, 0.8 * fade).strokeEllipse(center.x, center.y, reach * 1.5 * p, reach * 0.75 * p);
        for (const spark of debris) {
          blast.fillStyle(hue.fire, fade).fillCircle(center.x + spark.dx * p, center.y + spark.dy * p - Math.sin(p * Math.PI) * spark.lift, 3 * fade + 1);
        }
      },
      onComplete: () => { this.blasts.delete(blast); blast.destroy(); },
    });
  }

  private hide(visual: FallVisual): void {
    visual.ground.clear();
    visual.trail.clear();
    visual.sign.setVisible(false);
    visual.sprite.setVisible(false);
  }

  private release(visual: FallVisual): void {
    visual.ground.destroy();
    visual.trail.destroy();
    visual.sign.destroy();
    visual.sprite.destroy();
  }

  destroy(): void {
    for (const visual of this.visuals.values()) this.release(visual);
    this.visuals.clear();
    for (const blast of this.blasts) blast.destroy();
    this.blasts.clear();
  }
}
