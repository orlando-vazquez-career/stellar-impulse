import { test, expect, type Page } from '@playwright/test';

async function openTrainingArena(page: Page) {
  await page.goto('/');
  await page.locator('.panel--modes').getByRole('button', { name: 'Entrenamiento' }).click();
  await page.locator('.option-list').getByRole('button', { name: 'Un sector' }).click();
  await page.getByRole('button', { name: 'DESPLEGAR', exact: true }).click();
}

test('two browsers join, order a squad, and complete the training objective', async ({ browser, page }) => {
  await openTrainingArena(page);
  await page.getByRole('button', { name: 'Crear entrenamiento' }).click();
  await expect(page.getByTestId('room-code')).toBeVisible();
  const code = await page.getByTestId('room-code').innerText();
  const second = await browser.newContext();
  const opponent = await second.newPage();
  await openTrainingArena(opponent);
  await opponent.getByLabel('Código de sala').fill(code);
  await opponent.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(opponent.getByTestId('room-code')).toHaveText(code);
  await page.screenshot({ path: 'test-results/training-sector.png', fullPage: true });
  await page.getByRole('button', { name: 'Ir al nodo' }).click();
  await expect(page.getByText('Posición 4, 4', { exact: false })).toBeVisible({ timeout: 12000 });
  await page.getByRole('button', { name: 'Ir al Núcleo' }).click();
  await expect(page.getByRole('heading', { name: 'Núcleo asegurado' })).toBeVisible({ timeout: 45000 });
  await expect(opponent.getByRole('heading', { name: 'El rival tomó el Núcleo' })).toBeVisible();
  await second.close();
});

test('layout and basic keyboard access at five widths', async ({ page }) => {
  for (const width of [320, 768, 1024, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1080 });
    await openTrainingArena(page);
    await expect(page.getByRole('button', { name: 'Crear entrenamiento' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/layout-${width}.png`, fullPage: true });
  }
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Impulso Stellar, inicio' })).toBeFocused();
});
