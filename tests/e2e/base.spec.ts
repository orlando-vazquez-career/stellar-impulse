import { expect, test } from '@playwright/test';
import { chooseOpening, openApp } from './helpers';

test('builds the Refinery from the Base tab and surrenders once bases are exposed', async ({ page }) => {
  // x5 keeps the 2:30 shield to about 30 real seconds without racing a slow CI runner.
  test.setTimeout(120000);
  await openApp(page, '/?testTimeScale=5&testSeed=7');
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  // The easy rival never assaults bases, so nothing but the surrender can end this match.
  await page.getByRole('button', { name: /Fácil/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();
  await chooseOpening(page);

  // The Base shortcut selects the own base and brings its tab forward.
  const production = page.locator('.vi-production');
  await page.keyboard.press('b');
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-selected-base', 'own');
  await expect(production.getByRole('tab', { name: 'Base', exact: true })).toHaveAttribute('aria-selected', 'true');
  await production.getByRole('tab', { name: 'Base', exact: true }).click();
  await expect(production.locator('.vi-base-hull')).toContainText('1500/1500');
  await expect(production.locator('.vi-base-hull')).toContainText('Escudo');
  await production.getByRole('tab', { name: 'Módulos', exact: true }).click();
  const shipyard = production.getByRole('button', { name: /Astillero/ });
  await expect(shipyard).toBeDisabled();
  await expect(shipyard).toContainText('Requiere Refinería');

  const refinery = production.getByRole('button', { name: /^Refinería(?! II)/ });
  await expect(refinery).toBeEnabled({ timeout: 20000 });
  // No short click timeouts: headless Chromium draws the WebGL battlefield in software at a few
  // frames per second, so a click's actionability checks alone can take several seconds on CI.
  await refinery.click();
  await expect(refinery).toContainText(/Construido|Construyendo/, { timeout: 5000 });
  await expect(refinery).toContainText('Construido', { timeout: 20000 });
  await expect(shipyard).not.toContainText('Requiere Refinería');

  // Two clicks on the same control: the first arms it, the second confirms.
  const surrender = page.locator('.vi-surrender');
  await expect(surrender).toHaveText('Rendirse');
  await expect(surrender).toBeDisabled();
  await production.getByRole('tab', { name: 'Base', exact: true }).click();
  await expect(production).toContainText('Sin escudo', { timeout: 60000 });
  await expect(surrender).toBeEnabled();
  // A single click only arms it, and an armed button disarms itself after four seconds.
  await surrender.click();
  await expect(surrender).toHaveText('Confirmar rendición');
  await expect(surrender).toHaveText('Rendirse', { timeout: 10000 });
  // Two separate clicks can outlast that window on a slow renderer. A double click passes the
  // actionability checks once and sends both clicks back to back: the first arms, the second confirms.
  await surrender.dblclick();
  await expect(page.getByRole('dialog', { name: 'Derrota' })).toBeVisible({ timeout: 5000 });
  await expect(surrender).toHaveCount(0);
});
