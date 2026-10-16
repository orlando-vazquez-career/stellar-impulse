import { expect, test } from '@playwright/test';
import { canvasPointFromMinimap, chooseOpening, gamePoint, openApp } from './helpers';

test('a mixed-type group moves individually without a formation', async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByRole('button', { name: /Fácil/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await chooseOpening(page);
  await page.locator('.vi-production').getByRole('button', { name: /Explorador/ }).click();
  await expect(page.locator('.vi-resources')).toContainText('3/12', { timeout: 15000 });

  // Box-select the whole fleet around the hangar.
  const allies = page.locator('.map-ally');
  const points = [];
  for (const marker of await allies.all()) {
    points.push(await canvasPointFromMinimap(page, Number(await marker.getAttribute('cx')), Number(await marker.getAttribute('cy'))));
  }
  const xs = points.map((point) => point.x), ys = points.map((point) => point.y);
  await page.mouse.move(Math.min(...xs) - 50, Math.min(...ys) - 50);
  await page.mouse.down();
  await page.mouse.move(Math.max(...xs) + 50, Math.max(...ys) + 40, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByText('3 unidades seleccionadas')).toBeVisible();

  await expect(page.getByRole('radiogroup', { name: 'Formación' })).toHaveCount(0);

  // The smallest supported viewport must leave the hangar and minimap usable.
  await page.setViewportSize({ width: 1024, height: 768 });
  const selection = await page.locator('.vi-squad').boundingBox();
  const hangar = await page.locator('.vi-production').boundingBox();
  const minimap = await page.locator('.vi-minimap').boundingBox();
  expect(selection!.x + selection!.width).toBeLessThanOrEqual(hangar!.x);
  expect(selection!.x).toBeGreaterThanOrEqual(minimap!.x + minimap!.width);
  await page.screenshot({ path: 'test-results/mixed-group-layout-1024.png' });
  await page.setViewportSize({ width: 1366, height: 768 });
  // The mixed selection sends one ordinary move per ship, never a shared formation order.
  const starts = await allies.evaluateAll((markers) => markers.map((marker) => `${marker.getAttribute('cx')},${marker.getAttribute('cy')}`));
  const destination = await gamePoint(page, 15, 11);
  await page.mouse.click(destination.x, destination.y, { button: 'right' });
  await expect(page.locator('.map-move-route')).toHaveCount(1, { timeout: 10000 });
  await expect.poll(async () => {
    const now = await allies.evaluateAll((markers) => markers.map((marker) => `${marker.getAttribute('cx')},${marker.getAttribute('cy')}`));
    return now.filter((position, index) => position !== starts[index]).length;
  }, { timeout: 20000 }).toBe(3);
});


test('action shortcuts and live audio settings work during a match', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Audio');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByRole('button', { name: /Fácil/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await chooseOpening(page);
  await page.keyboard.press('g');
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-active-action', 'attack');
  await page.getByRole('button', { name: 'Sonido', exact: true }).click();
  await page.locator('#audio-effects-range').fill('17');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences')!).audio.effects)).toBe(17);
  await page.locator('.vi-sound-panel').getByLabel('Silenciar todo').check();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences')!).audio.muted)).toBe(true);
});
