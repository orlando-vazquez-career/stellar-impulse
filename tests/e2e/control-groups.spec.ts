import { expect, test } from '@playwright/test';
import { canvasPointFromMinimap, chooseOpening, openApp } from './helpers';

test('QERT production keys, numbered groups, and rebindable actions work together', async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.addInitScript(() => localStorage.setItem('impulso.visual-preferences', JSON.stringify({ controls: { attack: ['Shift+KeyZ'] } })));
  await openApp(page, '/?testTimeScale=5&testSeed=17');
  await page.getByLabel('Identificador de comandante').fill('Hotkeys');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByRole('button', { name: /Fácil/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await chooseOpening(page);

  const production = page.locator('.vi-production');
  await page.keyboard.press('q');
  await expect(production).toContainText(/Interceptor · \d+ s/, { timeout: 10000 });
  await expect(page.locator('.vi-resources')).toContainText('3/12', { timeout: 20000 });
  await expect(production.locator('.vi-production__unit').filter({ hasText: 'Interceptor' }).locator('kbd')).toHaveText('Q');

  const allies = page.locator('.map-ally');
  await expect(allies).toHaveCount(3, { timeout: 10000 });
  const points = [];
  for (const marker of await allies.all()) {
    points.push(await canvasPointFromMinimap(page,
      Number(await marker.getAttribute('cx')), Number(await marker.getAttribute('cy'))));
  }
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  await page.mouse.move(Math.min(...xs) - 50, Math.min(...ys) - 50);
  await page.mouse.down();
  await page.mouse.move(Math.max(...xs) + 50, Math.max(...ys) + 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('.vi-squad')).toContainText('3 unidades seleccionadas');

  await page.keyboard.press('Control+1');
  const point = points[0]!;
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('.vi-squad__group-unit')).toHaveCount(0);
  await page.keyboard.press('1');
  await expect(page.locator('.vi-squad')).toContainText('3 unidades seleccionadas');

  await expect(page.locator('.vi-actions')).toHaveCount(0);
  await page.keyboard.press('g');
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-active-action', '');
  await page.keyboard.press('Shift+z');
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-active-action', 'attack');
  await page.keyboard.press('m');
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-active-action', 'move');
  await page.mouse.click(points[0]!.x, points[0]!.y);
  await expect(page.locator('.vi-squad')).toContainText('Escuadrón seleccionado');
  await page.keyboard.press('h');
  await expect(page.locator('.vi-squad')).toContainText('Manteniendo posición');
  await page.keyboard.press('c');
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-active-action', 'capture');
  await page.keyboard.press('Escape');
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-active-action', '');

  const camera = page.locator('.map-camera');
  await expect(camera).toHaveCount(1);
  await page.keyboard.down('ArrowRight');
  await page.waitForTimeout(500);
  await page.keyboard.up('ArrowRight');
  const pannedX = await camera.getAttribute('data-world-x');
  await page.keyboard.press('Space');
  await expect.poll(() => camera.getAttribute('data-world-x')).not.toBe(pannedX);
});
