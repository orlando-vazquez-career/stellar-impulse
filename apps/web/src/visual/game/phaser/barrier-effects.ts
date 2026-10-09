import Phaser from 'phaser';

/** Shard colours of each barrier material, from its shaded face to its brightest edge. */
const SHARDS: Record<string, readonly number[]> = {
  hielo: [0x26549a, 0x5ca4de, 0xa0dcfa, 0xe8faff],
  chatarra: [0x363e4e, 0x62708a, 0x7e8a9c, 0xeca824],
};
const OUTLINE = 0x0e1626;
const SHARD_COUNT = 24;
const BURST_MS = 640;

/**
 * A barrier that fell shatters where the map drew it: a flash, shards flung outwards that drop back to the
 * ground and a puff of dust. Purely visual; every piece removes itself when it lands.
 */
export function shatterBarrier(scene: Phaser.Scene, art: Phaser.GameObjects.Image, material: string): void {
  const palette = SHARDS[material] ?? SHARDS.chatarra!;
  const width = art.displayWidth, height = art.displayHeight;
  // The art is anchored at its foot: the burst starts from the middle of what it showed.
  const centre = { x: art.x, y: art.y - height * 0.4 };
  const depth = art.depth + 1;
  scene.tweens.add({ targets: art, alpha: 0, duration: 90, onComplete: () => art.setVisible(false) });

  const flash = scene.add.ellipse(centre.x, centre.y, width * 0.55, height * 0.45, palette[3], 0.9).setDepth(depth).setBlendMode(Phaser.BlendModes.ADD);
  scene.tweens.add({ targets: flash, scale: 2.3, alpha: 0, duration: 280, ease: 'Cubic.easeOut', onComplete: () => flash.destroy() });

  for (let puff = 0; puff < 6; puff++) {
    const dust = scene.add.ellipse(centre.x + (Math.random() - 0.5) * width * 0.7, art.y - 8 - Math.random() * 14, 26, 15, palette[1], 0.32).setDepth(depth - 2);
    scene.tweens.add({ targets: dust, scale: 2.6 + Math.random(), alpha: 0, y: dust.y - 10, duration: BURST_MS + puff * 60, ease: 'Sine.easeOut', onComplete: () => dust.destroy() });
  }

  for (let index = 0; index < SHARD_COUNT; index++) {
    const size = 5 + Math.random() * 12;
    const from = { x: centre.x + (Math.random() - 0.5) * width * 0.6, y: centre.y + (Math.random() - 0.5) * height * 0.45 };
    // Flung sideways, up in an arc, and down to the ground around the barrier's foot.
    const side = (Math.random() - 0.5) * width * 1.5;
    const rise = 24 + Math.random() * 58;
    const ground = art.y - Math.random() * 14 + Math.abs(side) * 0.12;
    const spin = (Math.random() - 0.5) * 900;
    const shard = scene.add.triangle(from.x, from.y, 0, size, size * 0.45, 0, size * 0.95, size * 0.8, palette[index % palette.length])
      .setStrokeStyle(1, OUTLINE, 0.85).setDepth(depth);
    scene.tweens.addCounter({
      from: 0, to: 1, duration: BURST_MS * (0.75 + Math.random() * 0.5),
      onUpdate: (tween) => {
        const t = tween.getValue() ?? 1;
        shard.setPosition(from.x + side * (1 - (1 - t) ** 2), from.y + (ground - from.y) * t * t - rise * 4 * t * (1 - t));
        shard.setAngle(spin * t).setAlpha(Math.min(1, (1 - t) * 3.2));
      },
      onComplete: () => shard.destroy(),
    });
  }
}
