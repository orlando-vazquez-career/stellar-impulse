import { expect, test } from '@playwright/test';
import { chooseOpening, gamePoint, minimapPoint, openApp, readBattlefieldCamera } from './helpers';

test.describe('visual lobby', () => {
  test('offers Espiral Estelar and Caos Estelar before launch', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    const espiral = page.getByRole('button', { name: /Espiral Estelar/ });
    const caos = page.getByRole('button', { name: /Caos Estelar/ });
    await expect(espiral).toBeVisible();
    await expect(caos).toBeVisible();
    // The Sector 01 Tiled inspector is gone: the briefing only talks about the maps on offer.
    await expect(page.getByRole('button', { name: /Explorar mapa/ })).toHaveCount(0);
    await expect(page.locator('.vi-briefing')).not.toContainText(/Sector 01|Umbral Helios/);
    // The briefing draws the chosen map itself, not a placeholder.
    await expect(page.getByRole('img', { name: /Vista previa.*Espiral Estelar/ })).toHaveAttribute('data-map-id', 'espiral');
    await caos.click();
    await expect(caos).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.vi-briefing__data dd').first()).toHaveText('Caos Estelar');
    await expect(page.getByRole('img', { name: /Vista previa.*Caos Estelar/ })).toHaveAttribute('data-map-id', 'espiral-2');
  });

  test('presents the movement lab as a movement-only drill', async ({ page }) => {
    const earlyMessageWarnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('onMessage() not registered')) earlyMessageWarnings.push(message.text());
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/?testTimeScale=2&testSeed=42');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByRole('button', { name: /Laboratorio de movimiento/ }).click();

    await expect(page.locator('.vi-briefing__data > div').nth(1).locator('dd')).toHaveText('Practicar rutas y formaciones');
    await expect(page.locator('.vi-briefing__data')).not.toContainText('Duración estimada');
    await expect(page.locator('.vi-room .vi-difficulty')).toHaveCount(0);
    await expect(page.locator('.vi-room .vi-duration')).toHaveCount(0);

    await page.locator('.vi-ready-controls input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-movement-lab-banner')).toBeVisible();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.vi-minimap .map-camera')).toHaveAttribute('data-map-width', '31');
    await expect(page.locator('.vi-resources, .vi-sector-status, .vi-production, .vi-tutorial')).toHaveCount(0);

    const start = await gamePoint(page, 4, 15);
    await page.mouse.click(start.x, start.y - 12);
    await expect(page.getByRole('heading', { name: 'Escuadrón INT-1' })).toBeVisible();
    const marker = page.locator('.map-ally').first();
    const before = [await marker.getAttribute('cx'), await marker.getAttribute('cy')];
    const destination = await gamePoint(page, 10, 15);
    await page.mouse.click(destination.x, destination.y, { button: 'right' });
    await expect(page.locator('.map-move-route')).toHaveCount(1);
    const route = await page.locator('.map-move-route').getAttribute('points');
    expect(route).toBeTruthy();
    await expect.poll(async () => [await marker.getAttribute('cx'), await marker.getAttribute('cy')])
      .not.toEqual(before);
    expect(earlyMessageWarnings).toEqual([]);
  });

  test('selects a discovered station and recalls it from a control group', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/?testTimeScale=5&testSeed=42');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByRole('button', { name: /Trascendencia Estelar/ }).click();
    await page.locator('.vi-ready-controls input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await chooseOpening(page);
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');

    const scoutPoint = await gamePoint(page, 18, 95);
    await page.mouse.click(scoutPoint.x, scoutPoint.y);
    await expect(page.locator('.vi-squad')).toBeVisible();

    // Center the battlefield over the far station, then order the selected scout there to reveal it.
    const minimapTarget = await minimapPoint(page, 18, 18);
    const cameraBeforePan = await readBattlefieldCamera(page);
    const minimap = await page.locator('.vi-minimap__pan').boundingBox();
    if (!minimap) throw new Error('No minimap');
    await page.mouse.click(minimap.x + minimapTarget.x / 180 * minimap.width, minimap.y + minimapTarget.y / 180 * minimap.height);
    // centerOnCell updates Phaser synchronously, but React publishes the new camera attributes on its next render.
    // Wait until the target is actually inside the canvas before calculating the click point from those attributes.
    await expect.poll(async () => {
      const camera = await readBattlefieldCamera(page);
      if (camera.worldX === cameraBeforePan.worldX && camera.worldY === cameraBeforePan.worldY) return false;
      const point = await gamePoint(page, 18, 18);
      const canvas = await page.locator('.vi-phaser canvas').boundingBox();
      return !!canvas && point.x >= canvas.x && point.x <= canvas.x + canvas.width
        && point.y >= canvas.y && point.y <= canvas.y + canvas.height;
    }, { timeout: 10000 }).toBe(true);
    const destination = await gamePoint(page, 18, 18);
    await page.mouse.click(destination.x, destination.y, { button: 'right' });
    await expect(page.locator('.map-move-route')).toHaveCount(1, { timeout: 10000 });

    const stationMarker = page.locator('.map-node--station[data-node-id="station-1"]');
    await expect(stationMarker).toHaveAttribute('data-stale', 'false', { timeout: 45000 });
    const camera = await readBattlefieldCamera(page);
    const stationPoint = await gamePoint(page, Number(await stationMarker.getAttribute('data-cell-x')), Number(await stationMarker.getAttribute('data-cell-y')));
    // The dock is offset below its cell; this exposed rim avoids the scout near the centre.
    await page.mouse.click(stationPoint.x - 35 * camera.zoom, stationPoint.y + 9 * camera.zoom);
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-selected-station', 'station-1');
    await expect(page.locator('.vi-structure')).toBeVisible();

    await page.keyboard.press('Control+1');
    const clearPoint = await gamePoint(page, 22, 22);
    await page.mouse.click(clearPoint.x, clearPoint.y);
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-selected-station', '');
    await page.keyboard.press('1');
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-selected-station', 'station-1');
  });
});
