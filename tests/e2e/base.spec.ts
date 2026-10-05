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

  const production = page.locator('.vi-production');
  await production.getByRole('tab', { name: 'Base', exact: true }).click();
  await expect(production.locator('.vi-base-hull')).toContainText('1500/1500');
  await expect(production.locator('.vi-base-hull')).toContainText('Escudo');
  await production.getByRole('tab', { name: 'Módulos', exact: true }).click();
  const shipyard = production.getByRole('button', { name: /Astillero/ });
  await expect(shipyard).toBeDisabled();
  await expect(shipyard).toContainText('Requiere Refinería');

  const refinery = production.getByRole('button', { name: /^Refinería(?! II)/ });
  await expect(refinery).toBeEnabled({ timeout: 20000 });
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
  await surrender.click();
  await expect(surrender).toHaveText('Confirmar rendición');
  // This command only updates room state; verify its result without a navigation wait.
  await surrender.click({ timeout: 5000, noWaitAfter: true });
  await expect(page.getByRole('dialog', { name: 'Derrota' })).toBeVisible({ timeout: 5000 });
  await expect(surrender).toHaveCount(0);
});
