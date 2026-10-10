import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('visual lobby', () => {
  test('inspects the real Sector 01 Tiled map from Visual', async ({ page }) => {
    await openApp(page, '/');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByRole('button', { name: 'Explorar mapa Tiled' }).click();
    await expect(page.getByRole('heading', { name: 'Sector 01 · Umbral Helios' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Mapa Tiled Sector 01' })).toHaveAttribute('data-map-size', '29x29');
    await expect(page.getByRole('img', { name: 'Mapa Tiled Sector 01' })).toHaveAttribute('data-atlas-ready', 'true');
    await expect(page.getByText(/Base A ·/)).toBeVisible();
    await expect(page.getByText('Nave · 3, 3')).toBeVisible();
    const canvas = page.getByRole('img', { name: 'Mapa Tiled Sector 01' });
    const size = await canvas.evaluate((element) => ({
      cssWidth: element.getBoundingClientRect().width,
      cssHeight: element.getBoundingClientRect().height,
      nativeWidth: (element as HTMLCanvasElement).width,
      nativeHeight: (element as HTMLCanvasElement).height,
    }));
    await canvas.click({ position: {
      x: (29 * 32 + (4 - 3) * 32) * size.cssWidth / size.nativeWidth,
      y: (64 + (4 + 3) * 16) * size.cssHeight / size.nativeHeight,
    } });
    await expect(page.getByText('Nave · 4, 3')).toBeVisible();
    const selected = page.getByText(/Casilla .* · (Transitable|Bloqueada)/);
    const before = await selected.innerText();
    await page.getByRole('img', { name: 'Mapa Tiled Sector 01' }).click({ position: { x: 510, y: 260 } });
    await expect(selected).not.toHaveText(before);
    await page.screenshot({ path: 'test-results/tiled-sector.png' });
    await page.getByRole('button', { name: 'Volver a preparación' }).click();
    await expect(page.getByRole('heading', { name: 'Configura la operación.' })).toBeVisible();
  });

  test('offers Espiral Estelar and Caos Estelar before launch', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    const espiral = page.getByRole('button', { name: /Espiral Estelar/ });
    const caos = page.getByRole('button', { name: /Caos Estelar/ });
    await expect(espiral).toBeVisible();
    await expect(caos).toBeVisible();
    await caos.click();
    await expect(caos).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.vi-briefing__data dd').first()).toHaveText('Caos Estelar');
  });
});
