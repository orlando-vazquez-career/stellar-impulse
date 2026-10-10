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
    // A guest holds no NFT pieces: the premium voice is tried on and points to the Market instead of equipping.
    await page.getByRole('button', { name: 'Comentarista', exact: true }).click();
    const analystImage = page.getByRole('button', { name: /Voz de Analista/ }).locator('img');
    await expect(analystImage).toHaveAttribute('src', '/cosmetics/img/voz-analista.svg');
    await expect.poll(() => analystImage.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 512)).toBe(true);
    await page.getByRole('button', { name: /Voz de Analista/ }).click();
    await expect(page.getByRole('button', { name: /Voz de Analista/ })).toContainText('4 XLM');
    await expect(page.locator('.vi-item-detail')).toContainText('Ver en el Mercado');
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

  test('tries a collection hull on without equipping or saving it', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Hangar/ }).click();

    const preview = page.locator('.vi-ship-preview');
    const finish = () => preview.evaluate((element) => getComputedStyle(element).getPropertyValue('--hangar-finish-filter').trim());
    const artFilter = () => page.locator('.vi-ship-model__art').evaluate((element) => getComputedStyle(element).filter);
    const before = await finish();
    await expect(page.getByText('Vista previa · no equipado')).toHaveCount(0);

    await page.getByRole('button', { name: /Aurora andina/ }).click();
    await expect.poll(finish).toBe('hue-rotate(-45deg) saturate(1.2)');
    expect(before).not.toBe('hue-rotate(-45deg) saturate(1.2)');
    // The whole filter (glow included) still applies: an invalid finish would compute to none.
    await expect.poll(artFilter).not.toBe('none');
    await expect(page.getByText('Vista previa · no equipado')).toBeVisible();
    await expect(page.locator('.vi-item-detail')).toContainText('5 XLM');

    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect(page.getByText('Configuración guardada localmente')).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('impulso.cosmetic-loadout') ?? '{}'));
    expect(stored.hull).toBe('aegis');
  });

  test('opens the Market from the menu and from a Hangar piece, and survives a failed testnet read', async ({ page }) => {
    await page.route('**/soroban-testnet.stellar.org/**', (route) => route.abort());
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();

    // Seven operations fit at 1366×768, and the Hangar card is still the only /Hangar/ button.
    const cards = page.locator('.vi-menu-card');
    await expect(cards).toHaveCount(7);
    await expect(cards.last()).toBeInViewport();
    await expect(page.getByRole('button', { name: /Hangar/ })).toHaveCount(1);

    await page.getByRole('button', { name: /Mercado/ }).click();
    await expect(page.getByRole('heading', { name: 'Mercado de piezas' })).toBeVisible();
    await expect(page.locator('.vi-shop article', { hasText: 'Aurora andina' })).toContainText('5 XLM');
    await expect(page.locator('.vi-wallet-strip')).toContainText('Inicia sesión con tu cuenta');
    await expect(page.locator('.vi-shop').getByRole('button', { name: 'Comprar' }).first()).toBeDisabled();
    await page.getByRole('tab', { name: 'Anuncios' }).click();
    await expect(page.locator('.vi-market__empty')).toContainText('No hay anuncios activos');
    await page.getByRole('tab', { name: 'Mis piezas' }).click();
    await expect(page.locator('.vi-market__empty')).toContainText('Vincula una wallet');
    // The read starts after the chain client (Stellar SDK) loads lazily, which is slow on a busy runner.
    await expect(page.locator('.vi-chain-notice')).toContainText('No se pudo leer Stellar testnet', { timeout: 30_000 });
    await expect(page.getByRole('button', { name: /Hangar/ })).toHaveCount(1);

    // "View in the Market" from the Hangar opens that piece in the shop.
    await page.getByRole('button', { name: /Hangar/ }).click();
    await page.getByRole('button', { name: 'Comentarista', exact: true }).click();
    await page.getByRole('button', { name: /Voz de Analista/ }).click();
    await page.getByRole('button', { name: /Ver en el Mercado/ }).click();
    const detail = page.locator('.vi-market-detail');
    await expect(detail.getByRole('heading', { name: 'Voz de Analista' })).toBeVisible();
    await expect(detail).toContainText('4 XLM');
    await expect(detail).toContainText('Tienda oficial');
    const art = detail.locator('.vi-market-detail__art img');
    await expect.poll(() => art.evaluate((image: HTMLImageElement) => (image.complete ? image.naturalWidth : 0))).toBe(512);
    await detail.getByRole('button', { name: /Escuchar/ }).click();
    await expect(detail.getByRole('button', { name: /Detener/ })).toBeVisible();
    await detail.getByRole('button', { name: /Detener/ }).click();
    await expect(detail.getByRole('button', { name: /Escuchar/ })).toBeVisible();
    await page.screenshot({ path: 'test-results/market-detail.png' });
  });
});
