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
  // A busy CI renderer can drop a click; retry until the server has the order.
  await expect(async () => {
    if (await refinery.isEnabled()) await refinery.click({ timeout: 2000 });
    await expect(refinery).toContainText(/Construido|Construyendo/, { timeout: 2000 });
  }).toPass({ timeout: 30000 });
  await expect(refinery).toContainText('Construido', { timeout: 20000 });
  await expect(shipyard).not.toContainText('Requiere Refinería');

  // Two clicks on the same control: the first arms it, the second confirms.
  const surrender = page.locator('.vi-surrender');
  await expect(surrender).toHaveText('Rendirse');
  await expect(surrender).toBeDisabled();
  await production.getByRole('tab', { name: 'Base', exact: true }).click();
  await expect(production).toContainText('Sin escudo', { timeout: 60000 });
  await expect(surrender).toBeEnabled();
  // First click arms, second confirms. Retry the pair: a busy renderer can drop either click,
  // and an armed button disarms itself after four seconds.
  const defeat = page.getByRole('dialog', { name: 'Derrota' });
  await expect(async () => {
    if (await surrender.count()) await surrender.click({ timeout: 2000, noWaitAfter: true });
    await expect(defeat).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 40000 });
  await expect(surrender).toHaveCount(0);
});
