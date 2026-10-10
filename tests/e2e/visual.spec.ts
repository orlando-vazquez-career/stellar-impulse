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
    // Signing out lives in the header; the sidebar has no back button that did the same.
    await expect(page.getByRole('button', { name: /Ir atrás|IR ATRÁS/ })).toHaveCount(0);
    await expect(page).toHaveTitle('Stellar Impulse · Interfaz visual');
    await page.getByRole('button', { name: 'EN', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Commander Vega, the sector awaits.' })).toBeVisible();
    await expect(page.getByText('OPERATIONS', { exact: true })).toBeVisible();
    await expect(page.getByText(/OPERACIONES|SISTEMAS EN LÍNEA/)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Mute music', exact: true })).toBeVisible();
    await expect(page).toHaveTitle('Stellar Impulse · Visual interface');
    await page.getByRole('button', { name: 'ES', exact: true }).click();
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
    const borders = () => page.evaluate(() => ['.vi-menu-card', '.vi-settings-panel']
      .map((selector) => getComputedStyle(document.querySelector(selector)!).borderTopColor));
    const normalBorders = await borders();
    await page.getByLabel(/Contraste reforzado/).check();
    // The change shows before it is saved, on the menu cards and on the settings panel alike.
    await expect(page.locator('.visual-app')).toHaveClass(/is-high-contrast/);
    await expect.poll(borders).toEqual(['rgb(129, 149, 174)', 'rgb(129, 149, 174)']);
    expect(normalBorders).not.toContain('rgb(129, 149, 174)');

    const textSizes = () => page.evaluate(() => ['.vi-menu-card strong', '.vi-settings-panel h2']
      .map((selector) => Number.parseFloat(getComputedStyle(document.querySelector(selector)!).fontSize)));
    const normalText = await textSizes();
    await page.getByLabel(/Texto de interfaz ampliado/).check();
    await expect(page.locator('.visual-app')).toHaveClass(/is-large-text/);
    const largeText = await textSizes();
    expect(largeText[0]).toBeGreaterThanOrEqual(normalText[0]! * 1.1);
    expect(largeText[1]).toBeGreaterThanOrEqual(normalText[1]! * 1.1);
    const largePanel = await page.locator('.vi-settings-panel').boundingBox();
    expect(largePanel!.x + largePanel!.width).toBeLessThanOrEqual(1366);
    expect(largePanel!.y + largePanel!.height).toBeLessThanOrEqual(768);
    // Record every class the app goes through while saving: the saved contrast must take over from
    // the preview without the previous saved value showing in between.
    await page.locator('.visual-app').evaluate((app) => {
      const seen: string[] = [];
      (window as unknown as { contrastClasses: string[] }).contrastClasses = seen;
      new MutationObserver((records) => {
        for (const record of records) seen.push(record.oldValue ?? '', (record.target as Element).className);
      }).observe(app, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
    });
    await page.getByRole('button', { name: 'Guardar ajustes' }).click();

    await expect(page.locator('.visual-app')).toHaveClass(/is-high-contrast/);
    const classesWhileSaving = await page.evaluate(() => (window as unknown as { contrastClasses: string[] }).contrastClasses);
    expect(classesWhileSaving.filter((value) => !value.includes('is-high-contrast'))).toEqual([]);
    await expect(page.getByText('Ajustes guardados localmente')).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences') ?? '{}'));
    expect(stored.controls.move).toContain('KeyZ');
    expect(stored.accessibility.highContrast).toBe(true);
    expect(stored.accessibility.largeText).toBe(true);
  });

  test('holds the command center backdrop still when reduced motion is saved', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => localStorage.setItem('impulso.visual-preferences', JSON.stringify({ accessibility: { reducedMotion: true } })));
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await expect(page.locator('.visual-app')).toHaveClass(/is-reduced-motion/);
    const backdrop = page.locator('.vi-command-canvas');
    await expect(backdrop).toBeVisible();
    const frame = () => backdrop.evaluate((canvas) => (canvas as HTMLCanvasElement).toDataURL());
    const first = await frame();
    await page.waitForTimeout(500);
    // Compare as a boolean: a failure should not print two full PNG data URLs.
    expect(await frame() === first, 'the backdrop changed between frames').toBe(true);
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

  test('leaves key recording to the leave dialog and stops it when the changes are discarded', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    const storedBefore = await page.evaluate(() => localStorage.getItem('impulso.visual-preferences'));
    const settings = page.locator('.vi-settings-panel');
    const dialog = page.getByRole('alertdialog');
    const recording = page.locator('.vi-control-settings__recording');
    const move = page.getByRole('group', { name: 'Mover' });
    const attack = page.getByRole('group', { name: 'Atacar' });
    const openControls = async () => {
      await page.getByRole('button', { name: /Ajustes/ }).click();
      await page.getByRole('button', { name: /Controles/ }).click();
    };

    // Something to save, then a key recording still waiting for its key.
    await openControls();
    await attack.getByRole('button', { name: 'Quitar tecla G de Atacar' }).click();
    await expect(attack.locator('kbd')).toHaveCount(0);
    await move.getByRole('button', { name: 'Cambiar tecla M de Mover' }).click();
    await expect(recording).toBeVisible();

    // Escape belongs to the dialog: it keeps editing and is not recorded as the new key.
    await page.getByRole('button', { name: 'Volver al centro de mando' }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(settings).toBeVisible();
    await expect(move.locator('kbd')).toHaveText(['M']);
    await expect(recording).toBeVisible();

    // Discarding drops the change and the recording with it.
    await page.getByRole('button', { name: 'Volver al centro de mando' }).click();
    await dialog.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(settings).toHaveCount(0);
    await page.keyboard.press('z');
    expect(await page.evaluate(() => localStorage.getItem('impulso.visual-preferences'))).toBe(storedBefore);
    await openControls();
    await expect(recording).toHaveCount(0);
    await expect(move.locator('kbd')).toHaveText(['M']);
    await expect(attack.locator('kbd')).toHaveText(['G']);
    await page.keyboard.press('x');
    await expect(move.locator('kbd')).toHaveText(['M']);
    await expect(recording).toHaveCount(0);
  });

  test('mutes only the music from the command center and keeps it muted', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    const storedAudio = () => page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences') ?? '{}').audio);

    await page.getByRole('button', { name: 'Silenciar música', exact: true }).click();
    const unmute = page.getByRole('button', { name: 'Activar música', exact: true });
    await expect(unmute).toBeVisible();
    await expect(unmute).toContainText('MÚSICA');
    const audio = await storedAudio();
    expect(audio.musicMuted).toBe(true);
    expect([audio.effects, audio.voice, audio.interface]).toEqual([85, 90, 60]);

    // The settings panel shows the same saved mute, and closing it does not undo it.
    await page.getByRole('button', { name: /Ajustes/ }).click();
    await expect(page.locator('.vi-settings-panel').getByLabel('Silenciar música')).toBeChecked();
    await expect(unmute).toBeDisabled();
    await page.getByRole('button', { name: /Ajustes/ }).click();
    await expect(page.locator('.vi-settings-panel')).toHaveCount(0);
    await expect(unmute).toBeEnabled();
    expect((await storedAudio()).musicMuted).toBe(true);

    await page.reload();
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await expect(page.getByRole('button', { name: 'Activar música', exact: true })).toBeVisible();
    expect((await storedAudio()).musicMuted).toBe(true);
  });

  test('leaves the music switch nothing to do while all sound is muted', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => localStorage.setItem('impulso.visual-preferences', JSON.stringify({ audio: { muted: true } })));
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    const music = page.getByRole('button', { name: 'Silenciar música', exact: true });
    await expect(music).toBeVisible();
    await expect(music).toBeDisabled();
    await expect(music).toHaveClass(/is-muted/);
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
