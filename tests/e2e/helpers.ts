import { expect, type Page } from '@playwright/test';

/** Open the animated login, which now includes the commander alias form. */
export async function openApp(page: Page, url = '/') {
  await page.goto(url);
}
export async function chooseOpening(page: Page) {
  const cards = page.locator('.augment-opening .augment-card');
  await expect(cards).toHaveCount(3);
  await cards.first().click();
  await expect(page.locator('.augment-opening')).toHaveCount(0);
}
