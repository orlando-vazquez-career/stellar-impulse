import { expect, test } from '@playwright/test';

test('plays Sector 01 against the server rival and builds a ship', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Identificador de comandante').fill('Vega');
  await page.getByRole('button', { name: 'Continuar como invitado' }).click();
  await page.getByRole('button', { name: /Preparar operación/ }).click();
  await page.getByLabel('Estoy listo para desplegar').check();
  await page.getByRole('button', { name: 'Iniciar operación' }).click();

  const resources = page.locator('.vi-resources');
  // Authoritative start: four ships, one of each class, and the opening Metal.
  await expect(resources).toContainText('4/12', { timeout: 10000 });
  await expect(page.locator('.vi-production')).toContainText('Listo para construir');

  await page.locator('.vi-production').getByRole('button', { name: /Interceptor/ }).click();
  await expect(page.locator('.vi-production')).toContainText(/Interceptor · \d+ s/);
  await expect(resources).toContainText('5/12', { timeout: 10000 });
});
