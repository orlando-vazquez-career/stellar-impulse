import Phaser from 'phaser';

export const SHOCKWAVE_KEY = 'onda-portal';
export const STARDUST_KEY = 'polvo-estelar';
const SHOCKWAVE_ANIMATION = 'onda-portal-expandir';
const SHOCKWAVE_FRAME = { frameWidth: 192, frameHeight: 96 };
const SHOCKWAVE_FRAMES = 10;
const MESSAGE = 'PORTALES ABRIÉNDOSE';
const MESSAGE_VISIBLE_MS = 1600;
const DISSOLVE_MS = 900;
const UI_DEPTH = 2_000_000;

export function preloadPortalWarning(scene: Phaser.Scene, basePath: string): void {
  scene.load.spritesheet(SHOCKWAVE_KEY, `${basePath}/onda_portal.png`, SHOCKWAVE_FRAME);
  scene.load.image(STARDUST_KEY, `${basePath}/polvo_estelar.png`);
}

export function registerPortalWarningAnimation(scene: Phaser.Scene): void {
  if (scene.anims.exists(SHOCKWAVE_ANIMATION)) return;
  scene.anims.create({
    key: SHOCKWAVE_ANIMATION,
    frames: scene.anims.generateFrameNumbers(SHOCKWAVE_KEY, { start: 0, end: SHOCKWAVE_FRAMES - 1 }),
    frameRate: 14,
  });
}

/** Aviso antes de que se abran los portales: onda expansiva sobre cada portal y un texto que se deshace en polvo. */
export class PortalWarning {
  constructor(private readonly scene: Phaser.Scene) {}

  showAt(points: readonly { x: number; y: number }[]): void {
    points.forEach((point) => this.playShockwave(point.x, point.y));
    this.showMessage();
  }

  private playShockwave(x: number, y: number): void {
    const wave = this.scene.add.sprite(x, y, SHOCKWAVE_KEY, 0).setDepth(y + 1);
    wave.play(SHOCKWAVE_ANIMATION);
    wave.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => wave.destroy());
  }

  private showMessage(): void {
    const camera = this.scene.cameras.main;
    const text = this.scene.add.text(camera.width / 2, camera.height * 0.22, MESSAGE, {
      fontFamily: 'Orbitron, "Segoe UI", sans-serif',
      fontSize: '28px',
      color: '#bff8ff',
      stroke: '#0a2a3a',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(UI_DEPTH);
    this.scene.time.delayedCall(MESSAGE_VISIBLE_MS, () => this.dissolve(text));
  }

  private dissolve(text: Phaser.GameObjects.Text): void {
    const bounds = text.getBounds();
    const dust = this.scene.add.particles(0, 0, STARDUST_KEY, {
      x: { min: bounds.left, max: bounds.right },
      y: { min: bounds.top, max: bounds.bottom },
      speedY: { min: -40, max: -10 },
      speedX: { min: -20, max: 20 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: DISSOLVE_MS,
      emitting: false,
    }).setScrollFactor(0).setDepth(UI_DEPTH);
    dust.explode(80);
    this.scene.tweens.add({ targets: text, alpha: 0, duration: DISSOLVE_MS / 2, onComplete: () => text.destroy() });
    this.scene.time.delayedCall(DISSOLVE_MS, () => dust.destroy());
  }
}
