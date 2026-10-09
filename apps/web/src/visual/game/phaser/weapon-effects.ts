import Phaser from 'phaser';
import type { SquadViewModel } from '../model';
import { cellToIso } from './isometric';

/** Short, bounded effects for server-confirmed shots; these never resolve damage. */
export class WeaponEffects {
  private readonly active = new Set<Phaser.GameObjects.Graphics>();
  constructor(private readonly scene: Phaser.Scene) {}

  fire(squad: SquadViewModel, from: { x: number; y: number }): void {
    const shot = squad.lastShot;
    if (!shot || this.active.size >= 64) return;
    const to = cellToIso(shot.to.x, shot.to.y);
    const bomber = squad.unitType === 'bomber';
    const beam = squad.unitType === 'frigate';
    const hue = bomber ? 0xffba65 : squad.owner === 'blue' ? 0x83dfff : squad.owner === 'neutral' ? 0xffd166 : 0xff718c;
    const graphics = this.scene.add.graphics().setDepth(250000);
    this.active.add(graphics);
    const duration = bomber ? 520 : beam ? 180 : 200;
    const draw = (progress: number) => {
      graphics.clear();
      if (beam) {
        graphics.lineStyle(7, hue, 0.2 * (1 - progress));
        graphics.lineBetween(from.x, from.y - 6, to.x, to.y - 6);
        graphics.lineStyle(2, 0xe8f8ff, 1 - progress);
        graphics.lineBetween(from.x, from.y - 6, to.x, to.y - 6);
        return;
      }
      const at = (p: number) => ({ x: Phaser.Math.Linear(from.x, to.x, p),
        y: Phaser.Math.Linear(from.y - 6, to.y - 6, p) - (bomber ? Math.sin(p * Math.PI) * 34 : 0) });
      const head = at(progress), tail = at(Math.max(0, progress - (bomber ? 0.12 : 0.23)));
      graphics.lineStyle(bomber ? 3 : 2, hue, 0.65);
      graphics.lineBetween(tail.x, tail.y, head.x, head.y);
      graphics.fillStyle(hue, 0.22).fillCircle(head.x, head.y, bomber ? 8 : 5);
      graphics.fillStyle(bomber ? 0xffdc91 : 0xe8f8ff, 1).fillCircle(head.x, head.y, bomber ? 3.5 : 2);
    };
    draw(0);
    this.scene.tweens.addCounter({ from: 0, to: 1, duration,
      onUpdate: (tween) => draw(tween.getValue() ?? 0),
      onComplete: () => {
        this.remove(graphics);
        this.impact(to, hue, bomber ? shot.splashRadius : 0);
      },
    });
  }

  private impact(at: {x:number;y:number}, hue: number, splash: number): void {
    if (this.active.size >= 64) return;
    const graphics = this.scene.add.graphics().setDepth(250000);
    this.active.add(graphics);
    this.scene.tweens.addCounter({ from: 0, to: 1, duration: splash ? 350 : 130,
      onUpdate: (tween) => {
        const p = tween.getValue() ?? 0;
        const radius = splash ? 8 + p * (18 + splash * 15) : 3 + p * 7;
        graphics.clear().lineStyle(splash ? 2 : 1, hue, 1 - p);
        graphics.strokeEllipse(at.x, at.y - 4, radius * 2, radius);
        graphics.fillStyle(hue, 0.25 * (1 - p)).fillEllipse(at.x, at.y - 4, radius * 1.4, radius * 0.7);
      }, onComplete: () => this.remove(graphics),
    });
  }

  private remove(graphics: Phaser.GameObjects.Graphics): void {
    this.active.delete(graphics);
    graphics.destroy();
  }

  destroy(): void {
    for (const graphics of this.active) graphics.destroy();
    this.active.clear();
  }
}
