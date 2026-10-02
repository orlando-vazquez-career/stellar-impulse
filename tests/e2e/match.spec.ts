import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test('plays Espiral Estelar against the server rival and builds a ship', async ({ page }) => {
  await openApp(page, '/');
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();

  const resources = page.locator('.vi-resources');
  // Authoritative start: a scout and one combat ship, plus the opening Metal.
  await expect(resources).toContainText('2/12', { timeout: 10000 });
  await expect(page.locator('.vi-production')).toContainText('Listo para construir');

  await page.locator('.vi-production').getByRole('button', { name: /Interceptor/ }).click();
  await expect(page.locator('.vi-production')).toContainText(/Interceptor · \d+ s/);
  await expect(resources).toContainText('3/12', { timeout: 10000 });
});

test('double click on a ship selects every ship of its class on screen', async ({ page }) => {
  await openApp(page, '/');
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await expect(page.locator('.vi-resources')).toContainText('2/12', { timeout: 10000 });
  await page.locator('.vi-production').getByRole('button', { name: /Interceptor/ }).click();
  await expect(page.locator('.vi-resources')).toContainText('3/12', { timeout: 10000 });
  await page.waitForTimeout(500);

  // Find an Interceptor on screen from its minimap marker (isometric minimap → world → screen).
  const camera = page.locator('.map-camera');
  const scale = 172 / Number(await camera.getAttribute('data-iso-width'));
  const offsetY = 4 + (172 - Number(await camera.getAttribute('data-iso-height')) * scale) / 2;
  const worldX = Number(await camera.getAttribute('data-world-x'));
  const worldY = Number(await camera.getAttribute('data-world-y'));
  const zoom = Number(await camera.getAttribute('data-zoom'));
  const canvas = (await page.locator('.vi-phaser canvas').boundingBox())!;
  const markers = await page.locator('.map-ally').evaluateAll((nodes) => nodes.map((node) => [Number(node.getAttribute('cx')), Number(node.getAttribute('cy'))]));
  for (const [cx, cy] of markers) {
    const x = canvas.x + ((cx! - 4) / scale - worldX) * zoom;
    const y = canvas.y + ((cy! - offsetY) / scale - worldY) * zoom;
    await page.mouse.click(x, y);
    if (!(await page.locator('.vi-squad h2').textContent().catch(() => ''))?.includes('INT')) continue;
    await page.waitForTimeout(500);
    await page.mouse.dblclick(x, y);
    await expect(page.locator('.vi-squad')).toContainText('2 unidades seleccionadas');
    return;
  }
  throw new Error('No Interceptor found on screen');
});

test('login gate leads straight to a new training once the commander has an alias', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.li-viewport canvas')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Crear entrenamiento' })).toBeDisabled();
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Crear entrenamiento' }).click();
  await expect(page.getByRole('heading', { name: 'Configura la operación.' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Espiral Estelar 58/ })).toHaveAttribute('aria-pressed', 'true');
});

test('carries the room code from the login into the preparation lobby', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Unirse con código' }).click();
  await page.getByLabel('Código de sala').fill('ab12');
  await page.getByLabel('Código de sala').press('Enter');
  await expect(page.getByRole('heading', { name: 'Accede a la operación.' })).toBeVisible();
  await expect(page.getByLabel('Código de sala')).toHaveValue('AB12');
});

test('can continue as a guest while the empty room-code form is open', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Unirse con código' }).click();
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await expect(page.getByRole('heading', { name: 'Comandante Vega, el sector espera.' })).toBeVisible();
});
