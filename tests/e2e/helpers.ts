import { errors, expect, type Page } from '@playwright/test';

/** Open the animated login, which now includes the commander alias form. */
export async function openApp(page: Page, url = '/') {
  await page.goto(url);
}
/** Pick an opening card, or verify the server's automatic pick if the offer expires. */
export async function chooseOpening(page: Page) {
  const cards = page.locator('.augment-opening .augment-card');
  await expect(cards).toHaveCount(3);
  try {
    await cards.first().click({ timeout: 10000 });
  } catch (error) {
    // A slow runner may miss the offer; other interaction errors must still fail.
    if (!(error instanceof errors.TimeoutError)) throw error;
  }
  // At normal speed the server allows 30 seconds; accelerated tests expire sooner.
  await expect(page.locator('.augment-opening')).toHaveCount(0, { timeout: 35000 });
  // The authoritative match tick stays at zero until both opening choices are made.
  await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-tick', /^[1-9]\d*$/, { timeout: 10000 });
}
