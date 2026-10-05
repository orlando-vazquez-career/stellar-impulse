import { expect, type Page } from '@playwright/test';

/** Open the animated login, which now includes the commander alias form. */
export async function openApp(page: Page, url = '/') {
  await page.goto(url);
}
/** Pick the first opening card. With an accelerated clock the 30 s choice can expire on a
 * slow runner before the click lands; the server's automatic pick is just as valid. */
export async function chooseOpening(page: Page) {
  const cards = page.locator('.augment-opening .augment-card');
  await expect(cards).toHaveCount(3);
  await cards.first().click({ timeout: 3000 }).catch(() => {});
  await expect(page.locator('.augment-opening')).toHaveCount(0, { timeout: 15000 });
}
