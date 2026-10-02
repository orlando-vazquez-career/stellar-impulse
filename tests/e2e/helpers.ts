import type { Page } from '@playwright/test';

/** Open the animated login, which now includes the commander alias form. */
export async function openApp(page: Page, url = '/') {
  await page.goto(url);
}
