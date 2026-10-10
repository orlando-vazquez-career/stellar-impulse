import Phaser from 'phaser';
import { cloudAt, createNebula, type NebulaCloudState, type NebulaField } from '@impulso/sim';
import { sectorMap, sectorSurface } from '../../map/sector-map';
import { cellToIso } from './isometric';
import { gameText } from '../game-copy';
import type { Locale } from '../../i18n';

/** Above the ships (the fog hides them) but below routes, selection and the satellites' sky. */
const DEPTH = { route: 90003, cloud: 150000, sign: 290000 } as const;
const hue = { body: 0x7b2fd0, glow: 0xb56cff, edge: 0xd9a8ff, sign: 0xf1dcff } as const;
/** Puffs that make up a cloud: angle, distance from the centre (share of the half side) and size. */
const PUFFS = Array.from({ length: 11 }, (_, index) => ({
  angle: (index / 11) * Math.PI * 2,
  reach: 0.25 + ((index * 7) % 5) * 0.11,
  scale: 0.55 + ((index * 3) % 4) * 0.12,
  spin: index % 2 === 0 ? 1 : -1,
}));

interface CloudVisual {
  body: Phaser.GameObjects.Graphics;
  route: Phaser.GameObjects.Graphics;
  sign: Phaser.GameObjects.Text;
  countdown: number;
}

/**
 * Drifting purple clouds of the active map. Their position is a pure function of the tick, the same
 * one the server uses to slow and hide ships, so the client glides them between server views.
 */
export class NebulaEffects {
  private readonly field?: NebulaField;
  private readonly visuals = new Map<string, CloudVisual>();
  private locale: Locale = 'es';

  constructor(private readonly scene: Phaser.Scene, tickRate: number) {
    const spec = sectorSurface.nebula;
    if (!spec?.clouds.length) return;
    // Painted nebula is already terrain art; only the clouds need drawing.
    this.field = createNebula({ ...spec, cells: undefined }, sectorMap.width, sectorMap.height, tickRate);
    for (const cloud of this.field?.clouds ?? []) {
      this.visuals.set(cloud.id, {
        body: scene.add.graphics().setDepth(DEPTH.cloud),
        route: scene.add.graphics().setDepth(DEPTH.route),
        sign: scene.add.text(0, 0, '', {
          color: '#f1dcff', fontFamily: 'Rajdhani, sans-serif', fontSize: '18px', fontStyle: '700', stroke: '#1d0730', strokeThickness: 4,
        }).setOrigin(0.5, 1).setDepth(DEPTH.sign).setVisible(false),
        countdown: -1,
      });
    }
  }

  /** Language of the countdown signs; a sign up now is rewritten on the next update. */
  setLocale(locale: Locale): void {
    this.locale = locale;
    for (const visual of this.visuals.values()) visual.countdown = -1;
  }

  /** `tick` is the server tick plus the fraction elapsed since it arrived. */
  update(tick: number, tickRate: number): void {
    if (!this.field) return;
    const seconds = this.scene.time.now / 1000;
    for (const cloud of this.field.clouds) {
      const visual = this.visuals.get(cloud.id);
      if (!visual) continue;
      const state = cloudAt(cloud, tick);
      this.drawCloud(visual.body, state, seconds);
      this.drawRoute(visual, state, tick, tickRate, seconds);
    }
  }

  /** Overlapping translucent puffs swirling over the exact square of cells the cloud covers. */
  private drawCloud(graphics: Phaser.GameObjects.Graphics, state: NebulaCloudState, seconds: number): void {
    const half = state.size / 2;
    // The covered square runs from x - floor(size/2) to x + ceil(size/2) - 1: its centre is half a cell back.
    const cx = state.x - 0.5, cy = state.y - 0.5;
    const centre = cellToIso(cx, cy);
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]]
      .map(([dx, dy]) => { const point = cellToIso(cx + dx!, cy + dy!); return new Phaser.Math.Vector2(point.x, point.y); });
    const width = Math.abs(corners[1]!.x - corners[3]!.x);
    const breathe = 0.5 + 0.5 * Math.sin(seconds * 1.3 + state.x);
    graphics.clear();
    graphics.fillStyle(hue.body, 0.16 + 0.04 * breathe).fillPoints(corners, true);
    for (const puff of PUFFS) {
      const angle = puff.angle + seconds * 0.22 * puff.spin;
      const at = cellToIso(cx + Math.cos(angle) * puff.reach * half, cy + Math.sin(angle) * puff.reach * half);
      const size = width * 0.42 * puff.scale;
      graphics.fillStyle(puff.spin > 0 ? hue.body : hue.glow, 0.13 + 0.05 * breathe).fillEllipse(at.x, at.y - 6, size, size * 0.55);
    }
    graphics.fillStyle(hue.glow, 0.12 + 0.06 * breathe).fillEllipse(centre.x, centre.y - 8, width * 0.55, width * 0.3);
    graphics.lineStyle(2, hue.edge, 0.28 + 0.12 * breathe).strokePoints(corners, true);
  }

  /** Before a sortie: the route it will take, where it stops and a countdown. While moving: the trail ahead. */
  private drawRoute(visual: CloudVisual, state: NebulaCloudState, tick: number, tickRate: number, seconds: number): void {
    const { route, sign } = visual;
    route.clear();
    const warning = state.phase === 'warning';
    if (!warning && state.phase !== 'advancing') { sign.setVisible(false); visual.countdown = -1; return; }
    const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * (warning ? 4 : 1.5));
    const points = state.path.map((cell) => cellToIso(cell.x - 0.5, cell.y - 0.5));
    route.lineStyle(4, hue.glow, (warning ? 0.45 : 0.22) + 0.3 * pulse);
    for (let index = 0; index < points.length - 1; index += 1) {
      if (index % 2 === 1) continue; // dashed
      route.lineBetween(points[index]!.x, points[index]!.y, points[index + 1]!.x, points[index + 1]!.y);
    }
    const end = state.path.at(-1)!;
    const half = state.size / 2;
    const corners = [[-half, -half], [half, -half], [half, half], [-half, half]]
      .map(([dx, dy]) => { const point = cellToIso(end.x - 0.5 + dx!, end.y - 0.5 + dy!); return new Phaser.Math.Vector2(point.x, point.y); });
    route.fillStyle(hue.body, (warning ? 0.1 : 0.05) + 0.12 * pulse).fillPoints(corners, true);
    route.lineStyle(2, hue.edge, (warning ? 0.5 : 0.25) + 0.4 * pulse).strokePoints(corners, true);
    if (!warning) { sign.setVisible(false); visual.countdown = -1; return; }
    const home = cellToIso(state.path[0]!.x - 0.5, state.path[0]!.y - 0.5);
    const left = Math.max(0, Math.ceil((state.phaseEndsAt - tick) / tickRate));
    if (left !== visual.countdown) { visual.countdown = left; sign.setText(gameText(this.locale, 'nebulaWarning', { seconds: left })); }
    sign.setPosition(home.x, home.y - 40).setVisible(true).setAlpha(0.65 + 0.35 * pulse);
  }

  destroy(): void {
    for (const visual of this.visuals.values()) {
      visual.body.destroy();
      visual.route.destroy();
      visual.sign.destroy();
    }
    this.visuals.clear();
  }
}
