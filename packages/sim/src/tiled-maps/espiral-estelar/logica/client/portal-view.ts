import Phaser from 'phaser';
import type { PortalPhase } from '../src/cycle';

export const PORTAL_OPENING_KEY = 'portal-apertura';
export const PORTAL_ACTIVE_KEY = 'portal-activo';
const FRAME_SIZE = 112;
const OPENING_FRAMES = 16;
const ACTIVE_FRAMES = 8;
const ORIGIN_Y = (FRAME_SIZE - 34) / FRAME_SIZE;

const ANIMATION = { open: 'portal-abrir', close: 'portal-cerrar', idle: 'portal-girar' } as const;

export function preloadPortal(scene: Phaser.Scene, basePath: string): void {
  const frameConfig = { frameWidth: FRAME_SIZE, frameHeight: FRAME_SIZE };
  scene.load.spritesheet(PORTAL_OPENING_KEY, `${basePath}/portal_apertura.png`, frameConfig);
  scene.load.spritesheet(PORTAL_ACTIVE_KEY, `${basePath}/portal_activo.png`, frameConfig);
}

export function registerPortalAnimations(scene: Phaser.Scene): void {
  if (scene.anims.exists(ANIMATION.open)) return;
  const opening = scene.anims.generateFrameNumbers(PORTAL_OPENING_KEY, { start: 0, end: OPENING_FRAMES - 1 });
  scene.anims.create({ key: ANIMATION.open, frames: opening, frameRate: 20 });
  scene.anims.create({ key: ANIMATION.close, frames: [...opening].reverse(), frameRate: 20 });
  scene.anims.create({
    key: ANIMATION.idle,
    frames: scene.anims.generateFrameNumbers(PORTAL_ACTIVE_KEY, { start: 0, end: ACTIVE_FRAMES - 1 }),
    frameRate: 12,
    repeat: -1,
  });
}

/** Muestra un extremo de agujero de gusano y lo sincroniza con la fase que manda el servidor. */
export class PortalView {
  private readonly sprite: Phaser.GameObjects.Sprite;
  private currentPhase: PortalPhase | undefined;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    this.sprite = scene.add.sprite(x, y, PORTAL_OPENING_KEY, 0).setOrigin(0.5, ORIGIN_Y).setDepth(y).setVisible(false);
  }

  sync(phase: PortalPhase): void {
    if (phase === this.currentPhase) return;
    this.currentPhase = phase;
    if (phase === 'opening') this.playOpening();
    else if (phase === 'open') this.sprite.setVisible(true).play(ANIMATION.idle, true);
    else if (phase === 'closing') this.playClosing();
    else this.sprite.setVisible(false).stop();
  }

  private playOpening(): void {
    this.sprite.setVisible(true).play(ANIMATION.open);
    this.sprite.chain(ANIMATION.idle);
  }

  private playClosing(): void {
    this.sprite.setVisible(true).play(ANIMATION.close);
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.sprite.setVisible(false));
  }
}
