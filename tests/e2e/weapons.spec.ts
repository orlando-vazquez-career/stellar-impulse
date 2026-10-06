import { expect, test } from '@playwright/test';
import type { GameplayViewModel } from '../../apps/web/src/visual/game/model';
import { openApp } from './helpers';

test('renders confirmed projectiles, beams, bombs and reload bars once per shot', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/visual/game/phaser/PhaserBattlefield.tsx*', async route => {
    const response = await route.fetch();
    const body = await response.text();
    expect(body).toContain('gameRef.current = game;');
    await route.fulfill({ response, body: body.replace('gameRef.current = game;',
      'Object.assign(window, { __weaponTestGame: game }); gameRef.current = game;') });
  });
  await openApp(page, '/visual?adapter=mock');
  await page.getByLabel('Identificador de comandante').fill('Nova');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');

  // Exercise the real Phaser renderer with the same confirmed-shot shape that
  // the authoritative adapter receives. No extra game/testing API is shipped.
  const fired = await page.evaluate(() => {
    const game = (window as unknown as { __weaponTestGame: { scene: { getScene(key: string): unknown } } }).__weaponTestGame;
    const scene = game.scene.getScene('MainScene') as {
      snapshot: GameplayViewModel; sync(view: GameplayViewModel): void; centerOnCell(x: number, y: number): void;
      weapons: { active: Set<unknown> };
    };
    const squads = scene.snapshot.squads.filter(ship => ship.owner === 'blue').map((ship, index) => ({
      ...ship, gridX: 12 + index, gridY: 13, attackCooldown: { remainingTicks: ship.unitType === 'bomber' ? 30 : ship.unitType === 'frigate' ? 10 : 5,
        durationTicks: ship.unitType === 'bomber' ? 30 : ship.unitType === 'frigate' ? 10 : 5 },
      lastShot: { tick: 30, from: { x: 12 + index, y: 13 }, to: { x: 15, y: 13 }, splashRadius: ship.unitType === 'bomber' ? 1 : 0 },
    }));
    scene.centerOnCell(13, 13);
    const view = { ...scene.snapshot, tick: 30, tickRate: 10, clockRunning: true, squads };
    scene.sync(view);
    const first = scene.weapons.active.size;
    scene.sync(view);
    return { first, repeated: scene.weapons.active.size, classes: squads.map(ship => ship.unitType).sort() };
  });
  expect(fired).toEqual({ first: 3, repeated: 3, classes: ['bomber', 'frigate', 'interceptor'] });
  await page.screenshot({ path: 'test-results/weapon-shots.png' });

  const reloaded = await page.evaluate(async () => {
    const game = (window as unknown as { __weaponTestGame: { scene: { getScene(key: string): unknown } } }).__weaponTestGame;
    const scene = game.scene.getScene('MainScene') as {
      snapshot: GameplayViewModel; sync(view: GameplayViewModel): void;
      unitVisuals: Map<string, { reload: { width: number; fillColor: number; visible: boolean }; reloadBack: { visible: boolean } }>;
    };
    scene.sync({ ...scene.snapshot, tick: 60, squads: scene.snapshot.squads.map(ship => ({ ...ship,
      attackCooldown: { remainingTicks: 0, durationTicks: ship.attackCooldown!.durationTicks } })) });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    return [...scene.unitVisuals.values()].map(visual => ({ width: visual.reload.width,
      color: visual.reload.fillColor, visible: visual.reload.visible && visual.reloadBack.visible }));
  });
  expect(reloaded).toEqual(Array(3).fill({ width: 38, color: 0xa0aab6, visible: true }));
  await page.waitForTimeout(1000);
  await page.getByRole('button', { name: 'Salir de simulación' }).click();
  expect(errors).toEqual([]);
});
