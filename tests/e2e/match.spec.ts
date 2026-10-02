import { expect, test } from '@playwright/test';

test('plays Sector 01 against the server rival and builds a ship', async ({ page }) => {
  await page.goto('/');
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
