import { expect, test } from '@playwright/test';
import { openApp, chooseOpening } from './helpers';

test('retires an accidental ship with Delete and buys capacity and damage upgrades with Metal', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await chooseOpening(page);
  await expect(page.locator('.vi-resources')).toContainText('2/12');
  const production = page.locator('.vi-production');
  await production.getByRole('button', { name: /Explorador/ }).click();
  await expect(page.locator('.vi-resources')).toContainText('3/12', { timeout: 10000 });
  const camera = page.locator('.map-camera');
  const scale = 172 / Number(await camera.getAttribute('data-iso-width'));
  const offsetY = 4 + (172 - Number(await camera.getAttribute('data-iso-height')) * scale) / 2;
  const worldX = Number(await camera.getAttribute('data-world-x'));
  const worldY = Number(await camera.getAttribute('data-world-y'));
  const zoom = Number(await camera.getAttribute('data-zoom'));
  const canvas = (await page.locator('.vi-phaser canvas').boundingBox())!;
  const marker = page.locator('.map-ally').nth(2);
  const cx = Number(await marker.getAttribute('cx'));
  const cy = Number(await marker.getAttribute('cy'));
  await page.mouse.click(canvas.x + ((cx - 4) / scale - worldX) * zoom,
    canvas.y + ((cy - offsetY) / scale - worldY) * zoom);
  await expect(page.locator('.vi-squad')).toBeVisible();
  await expect(page.locator('.vi-squad h2')).toContainText('EXP-2');
  await page.keyboard.press('Delete');
  await expect(page.locator('.vi-resources')).toContainText('2/12');
  await expect(page.locator('.vi-squad')).toHaveCount(0);

  await production.getByRole('tab', { name: 'Base', exact: true }).click();
  const capacity = production.getByRole('button', { name: /Capacidad/ });
  await expect(capacity).toBeEnabled({ timeout: 25000 });
  await capacity.click();
  await expect(page.locator('.vi-resources')).toContainText('2/16');
  await expect(capacity).toContainText('Nivel 1/3');
  await expect(capacity).toContainText('20 Metal');
  const damage = production.getByRole('button', { name: /Daño de base/ });
  await expect(damage).toBeEnabled({ timeout: 30000 });
  await damage.click();
  // The base fires on its own (12) and the first upgrade adds 10.
  await expect(production).toContainText('22 daño');
  await expect(damage).toContainText('Nivel 1/3');
  await page.screenshot({ path: 'test-results/base-upgrades.png' });
  const overlap = await page.evaluate(() => {
    const base = document.querySelector('.vi-production')!.getBoundingClientRect();
    const actions = document.querySelector('.vi-actions')!.getBoundingClientRect();
    return base.x < actions.right && base.right > actions.x && base.y < actions.bottom && base.bottom > actions.y;
  });
  expect(overlap).toBe(false);
});

test('plays Espiral Estelar against the server rival and builds a ship', async ({ page }) => {
  await openApp(page, '/');
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await chooseOpening(page);

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
  await chooseOpening(page);
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
    await expect(page.locator('.vi-squad__group-unit')).toHaveCount(1);
    await expect(page.locator('.vi-squad__group-unit')).toContainText('2 × Interceptor');
    expect((await page.locator('.vi-squad').boundingBox())!.height).toBeLessThan(150);
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

test('requires an account before joining a multiplayer room from the login', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Unirse con código' }).click();
  await page.getByLabel('Código de sala').fill('ab12');
  await page.getByLabel('Código de sala').press('Enter');
  await expect(page.getByRole('status')).toContainText('Inicia sesión con tu cuenta');
  await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: false })).toBeEnabled();
  await expect(page.getByLabel('Correo electrónico')).toBeVisible();
  await expect(page.locator('.vi-lobby')).toHaveCount(0);
});

test('can continue as a guest while the empty room-code form is open', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Unirse con código' }).click();
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await expect(page.getByRole('heading', { name: 'Comandante Vega, el sector espera.' })).toBeVisible();
});

