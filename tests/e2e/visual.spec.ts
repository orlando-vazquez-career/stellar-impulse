import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('visual interface foundation', () => {
  test('opens Visual as the only main entry and keeps the legacy lobby out', async ({ page }) => {
    await openApp(page, '/');
    await expect(page.getByRole('heading', { name: 'Toma el mando.' })).toBeVisible();
    await expect(page.locator('.panel--modes')).toHaveCount(0);
  });

  test('supports the guest flow and bilingual copy', async ({ page }) => {
    await openApp(page, '/visual?adapter=mock');

    await expect(page.getByRole('heading', { name: 'Toma el mando.' })).toBeVisible();
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Take command.' })).toBeVisible();
    await page.getByRole('button', { name: 'ES', exact: true }).click();

    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await expect(page.getByRole('heading', { name: 'Comandante Vega, el sector espera.' })).toBeVisible();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await expect(page.getByRole('heading', { name: 'Configura la operación.' })).toBeVisible();
    await expect(page.getByText('ST-0427', { exact: true })).toBeVisible();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();

    await expect(page.getByLabel('Campo táctico Phaser')).toBeVisible();
    await expect(page.locator('.vi-phaser canvas')).toBeVisible();
    await expect(page.getByLabel('HUD táctico')).toBeVisible();
    await expect(page.locator('.vi-actions')).toHaveCount(0);
    await expect(page.getByText('Acciones', { exact: true })).toHaveCount(0);
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-map-source', 'sector-01.tmj');
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-atlas-ready', 'true');
    await page.screenshot({ path: 'test-results/visual-sector.png' });
  });

  test('shows the desktop-only warning below 1024 px', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto('/visual?adapter=mock');
    await expect(page.getByRole('heading', { name: 'Resolución no compatible' })).toBeVisible();
  });

  test('requires a signed-in account for multiplayer from the command center', async ({ page }) => {
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Unirse a sala/ }).click();
    await expect(page.getByRole('status')).toContainText('Inicia sesión con tu cuenta');
    await expect(page.getByRole('button', { name: 'Iniciar sesión', exact: false })).toBeEnabled();
    await expect(page.locator('.vi-lobby')).toHaveCount(0);
  });

  test('saves local control and accessibility settings', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Ajustes/ }).click();

    await expect(page.getByRole('heading', { name: 'Ajusta tu puesto de mando.' })).toBeVisible();
    const panelBox = await page.locator('.vi-settings-panel').evaluate((element) => {
      const panel = element.getBoundingClientRect();
      const footer = document.querySelector('.vi-screen__footer')?.getBoundingClientRect();
      return { ...panel.toJSON(), clearsFooter: footer ? panel.bottom <= footer.top : false };
    });
    expect(panelBox.right).toBeLessThanOrEqual(1366);
    expect(panelBox.bottom).toBeLessThanOrEqual(768);
    expect(panelBox.clearsFooter).toBe(true);

    await page.getByRole('button', { name: /Controles/ }).click();
    const moveControls = page.getByRole('group', { name: 'Mover' });
    await moveControls.getByRole('button', { name: 'Cambiar tecla M de Mover' }).click();
    await page.keyboard.press('z');
    await expect(moveControls.locator('kbd')).toContainText('Z');
    await page.getByRole('button', { name: /Accesibilidad/ }).click();
    await page.getByLabel(/Contraste reforzado/).check();
    await page.getByRole('button', { name: 'Guardar ajustes' }).click();

    await expect(page.locator('.visual-app')).toHaveClass(/is-high-contrast/);
    await expect(page.getByText('Ajustes guardados localmente')).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences') ?? '{}'));
    expect(stored.controls.move).toContain('KeyZ');
    expect(stored.accessibility.highContrast).toBe(true);
  });

  test('asks before leaving settings with unsaved changes', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    const storedBefore = await page.evaluate(() => localStorage.getItem('impulso.visual-preferences'));
    const settings = page.locator('.vi-settings-panel');
    const close = page.getByRole('button', { name: 'Volver al centro de mando' });
    const dialog = page.getByRole('alertdialog');
    const contrast = page.getByLabel(/Contraste reforzado/);
    const openAccessibility = async () => {
      await page.getByRole('button', { name: /Ajustes/ }).click();
      await page.getByRole('button', { name: /Accesibilidad/ }).click();
    };

    // Nothing changed: the ✕ closes at once.
    await page.getByRole('button', { name: /Ajustes/ }).click();
    await expect(settings).toBeVisible();
    await close.click();
    await expect(settings).toHaveCount(0);
    await expect(dialog).toHaveCount(0);

    // Switching a setting on and off again leaves nothing to save.
    await openAccessibility();
    await contrast.check();
    await contrast.uncheck();
    await close.click();
    await expect(settings).toHaveCount(0);
    await expect(dialog).toHaveCount(0);

    // A real change asks first; keeping on editing leaves the panel as it was.
    await openAccessibility();
    await contrast.check();
    await close.click();
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(dialog.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Seguir editando' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(contrast).toBeChecked();
    await close.click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeVisible();

    // Discarding closes the panel and forgets the change.
    await close.click();
    await dialog.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(settings).toHaveCount(0);
    await expect(page.locator('.visual-app')).not.toHaveClass(/is-high-contrast/);
    expect(await page.evaluate(() => localStorage.getItem('impulso.visual-preferences'))).toBe(storedBefore);

    // Saving on the way out keeps the change and goes where the player was heading.
    await openAccessibility();
    await contrast.check();
    await page.getByRole('button', { name: /Hangar/ }).click();
    await dialog.getByRole('button', { name: 'Guardar y salir' }).click();
    await expect(page.getByRole('heading', { name: 'Define tu firma visual.' })).toBeVisible();
    await expect(settings).toHaveCount(0);
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences') ?? '{}'));
    expect(stored.accessibility.highContrast).toBe(true);
  });

  test('login music controls change and persist music only', async ({ page }) => {
    await openApp(page, '/visual?adapter=mock');
    await page.getByRole('button', { name: 'Opciones de música' }).click();
    await page.getByLabel('Volumen de música').fill('27');
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences')!).audio.music)).toBe(27);
    await page.getByLabel('Silenciar música').check();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences')!).audio.musicMuted)).toBe(true);
    const otherChannels = await page.evaluate(() => {
      const audio = JSON.parse(localStorage.getItem('impulso.visual-preferences')!).audio;
      return [audio.effects, audio.voice, audio.interface];
    });
    expect(otherChannels).toEqual([85, 90, 60]);
  });
});
