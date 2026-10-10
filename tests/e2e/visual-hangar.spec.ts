import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('visual hangar', () => {
  test('previews and saves a cosmetic-only hangar loadout', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Hangar/ }).click();

    await expect(page.getByRole('heading', { name: 'Define tu firma visual.' })).toBeVisible();
    await expect(page.getByText('Solo cosmético · Sin ventajas').first()).toBeVisible();
    const shipRoster = page.getByRole('navigation', { name: 'Diseños de flota' });
    await expect(shipRoster.getByRole('button')).toHaveCount(4);
    const frigateOption = shipRoster.getByRole('button', { name: 'Fragata' });
    await frigateOption.click();
    await expect(frigateOption).toHaveAttribute('aria-pressed', 'true');
    const shipPreview = page.getByRole('img', { name: 'Fragata' });
    await expect(shipPreview).toHaveAttribute('src', /frigate-blue\.png$/);
    await expect.poll(() => shipPreview.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const previewFitsStage = await shipPreview.evaluate((image) => {
      const stage = image.closest('.vi-ship-stage')!.getBoundingClientRect();
      const art = image.getBoundingClientRect();
      return art.top >= stage.top && art.bottom <= stage.bottom && art.left >= stage.left && art.right <= stage.right;
    });
    expect(previewFitsStage).toBe(true);
    await shipRoster.getByRole('button', { name: 'Interceptor' }).click();
    const previewBox = await page.locator('.vi-ship-preview').evaluate((element) => {
      const preview = element.getBoundingClientRect();
      const footer = document.querySelector('.vi-screen__footer')?.getBoundingClientRect();
      return { ...preview.toJSON(), clearsFooter: footer ? preview.bottom <= footer.top : false };
    });
    expect(previewBox.right).toBeLessThanOrEqual(1366);
    expect(previewBox.clearsFooter).toBe(true);

    await page.getByRole('button', { name: /Polar MK-II/ }).click();
    await expect(page.getByRole('button', { name: /Polar MK-II/ })).toContainText('Equipado');
    // A guest holds no NFT pieces: the premium voice opens its purchase detail instead of equipping.
    await page.getByRole('button', { name: 'Comentarista', exact: true }).click();
    const analystImage = page.getByRole('button', { name: /Voz de Analista/ }).locator('img');
    await expect(analystImage).toHaveAttribute('src', '/cosmetics/img/voz-analista.svg');
    await expect.poll(() => analystImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 512)).toBe(true);
    await page.getByRole('button', { name: /Voz de Analista/ }).click();
    await expect(page.getByRole('button', { name: /Voz de Analista/ })).toContainText('4 XLM');
    await expect(page.locator('.vi-item-detail')).toContainText('Vincula una wallet para comprar.');
    await expect(page.locator('.vi-wallet-strip')).toContainText('Inicia sesión con tu cuenta');
    await page.getByRole('button', { name: 'Música', exact: true }).click();
    const musicImage = page.getByRole('button', { name: /Gravity's Final Path/ }).locator('img');
    await expect(musicImage).toHaveAttribute('src', '/cosmetics/img/musica-gravity-final-path.svg');
    await expect.poll(() => musicImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 512)).toBe(true);
    await page.getByRole('button', { name: /Iron Vanguard/ }).click();
    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect(page.getByText('Configuración guardada localmente')).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('impulso.cosmetic-loadout') ?? '{}'));
    expect(stored.hull).toBe('polar');
    expect(stored.voice).toBe('voz-vela');
    expect(stored.music).toBe('musica-iron-vanguard');
    const tabsFit = await page.locator('.vi-collection > nav').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return Array.from(element.querySelectorAll('button')).every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right && button.scrollWidth <= button.clientWidth;
      });
    });
    expect(tabsFit).toBe(true);
    await page.getByRole('button', { name: /Volver al centro de mando/ }).click();
    await page.getByRole('button', { name: /Hangar/ }).click();
    await expect(page.getByRole('button', { name: /Polar MK-II/ })).toContainText('Equipado');
    await page.getByRole('button', { name: 'Música', exact: true }).click();
    await expect(page.getByRole('button', { name: /Iron Vanguard/ })).toContainText('Equipado');
    await page.screenshot({ path: 'test-results/hangar-audio.png' });
    await page.setViewportSize({ width: 1024, height: 768 });
    const compactRosterFits = await shipRoster.evaluate((roster) => {
      const bounds = roster.getBoundingClientRect();
      return Array.from(roster.querySelectorAll('button')).every((button) => {
        const rect = button.getBoundingClientRect();
        return rect.left >= bounds.left && rect.right <= bounds.right && rect.width >= 44;
      });
    });
    const compactLayoutHasNoHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(compactRosterFits).toBe(true);
    expect(compactLayoutHasNoHorizontalOverflow).toBe(true);
    await page.screenshot({ path: 'test-results/hangar-1024.png', fullPage: true });
  });
});
