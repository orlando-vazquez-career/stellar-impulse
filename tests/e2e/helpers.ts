import type { Page } from '@playwright/test';

/** Open the app and pass Yamil's login gate through "Atlas de mando" to the commander alias screen. */
export async function openApp(page: Page, url = '/') {
  await page.goto(url);
  await page.getByRole('button', { name: /Atlas de mando/ }).click();
}
