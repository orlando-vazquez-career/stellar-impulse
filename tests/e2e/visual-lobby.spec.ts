import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

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
});
