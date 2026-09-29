import { expect, test } from '@playwright/test';

test.describe('visual interface foundation', () => {
  test('supports the guest flow and bilingual copy', async ({ page }) => {
    await page.goto('/visual');

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
    await expect(page.getByText('Acciones', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar Esc' })).toBeDisabled();
  });

  test('keeps HUD modules inside 1366×768 without overlap', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/visual');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();

    const lobbyLayout = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('.vi-lobby-card'));
      const outside = elements.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.x < 0 || rect.y < 0 || rect.right > innerWidth || rect.bottom > innerHeight;
      }).length;
      const smallestText = Math.min(...Array.from(document.querySelectorAll('.vi-lobby__content *'))
        .filter((element) => element.children.length === 0 && element.textContent?.trim())
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
      const footer = document.querySelector('.vi-screen__footer')?.getBoundingClientRect();
      const lowestCard = Math.max(...elements.map((element) => element.getBoundingClientRect().bottom));
      return { outside, smallestText, clearsFooter: footer ? lowestCard <= footer.top : false };
    });
    expect(lobbyLayout.outside).toBe(0);
    expect(lobbyLayout.smallestText).toBeGreaterThanOrEqual(12);
    expect(lobbyLayout.clearsFooter).toBe(true);

    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();

    const layout = await page.evaluate(() => {
      const selectors = ['.vi-resources', '.vi-sector-status', '.vi-top-controls', '.vi-minimap', '.vi-squad', '.vi-actions'];
      const boxes = selectors.map((selector) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        return { selector, rect: element.getBoundingClientRect().toJSON() };
      });
      const overlaps: string[] = [];
      for (let left = 0; left < boxes.length; left += 1) {
        for (let right = left + 1; right < boxes.length; right += 1) {
          const a = boxes[left].rect;
          const b = boxes[right].rect;
          if (a.x < b.right && a.right > b.x && a.y < b.bottom && a.bottom > b.y) {
            overlaps.push(`${boxes[left].selector}:${boxes[right].selector}`);
          }
        }
      }
      const smallestText = Math.min(...Array.from(document.querySelectorAll('.vi-hud *'))
        .filter((element) => element.children.length === 0 && element.textContent?.trim())
        .map((element) => Number.parseFloat(getComputedStyle(element).fontSize)));
      return {
        overlaps,
        outside: boxes.filter(({ rect }) => rect.x < 0 || rect.y < 0 || rect.right > innerWidth || rect.bottom > innerHeight).map(({ selector }) => selector),
        overflow: [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight],
        smallestText,
      };
    });

    expect(layout.overlaps).toEqual([]);
    expect(layout.outside).toEqual([]);
    expect(layout.overflow).toEqual([0, 0]);
    expect(layout.smallestText).toBeGreaterThanOrEqual(12);

    const minimap = page.locator('.vi-minimap');
    await minimap.getByRole('button', { name: 'Plegar' }).click();
    await expect(minimap.getByRole('img', { name: 'Minimapa' })).toBeHidden();
    await minimap.getByRole('button', { name: 'Expandir' }).click();
    await expect(minimap.getByRole('img', { name: 'Minimapa' })).toBeVisible();

    await page.getByRole('button', { name: 'Preferencias' }).click();
    await expect(page.getByRole('complementary', { name: 'Development Controls' })).toBeVisible();
    await expect(page.getByLabel('Estado del Núcleo')).toHaveValue('locked');
  });

  test('loads one Phaser canvas and pans at the edge without clicking', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/visual');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    const field = page.locator('.vi-phaser canvas');
    await expect(field).toBeVisible();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.vi-phaser canvas')).toHaveCount(1);
    const camera = page.locator('.map-camera');
    await expect(camera).toBeVisible();
    expect(Number(await camera.getAttribute('width'))).toBeLessThan(90);
    const initialCameraX = await camera.getAttribute('x');
    const initialCameraY = await camera.getAttribute('y');

    // Loading the canvas must not count as pointer input at the top-left edge.
    const idlePositions = await camera.evaluate(async (element) => {
      const positions = new Set<string>();
      for (let frame = 0; frame < 12; frame += 1) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        positions.add(`${element.getAttribute('x')},${element.getAttribute('y')}`);
      }
      return [...positions];
    });
    expect(idlePositions).toEqual([`${initialCameraX},${initialCameraY}`]);

    const box = await field.boundingBox();
    if (!box) throw new Error('Phaser canvas is not visible');
    await page.mouse.move(box.x + 5, box.y + box.height / 2);
    await expect.poll(() => camera.getAttribute('x')).not.toBe(initialCameraX);

    await page.getByRole('button', { name: 'Mover cámara desde el minimapa' }).click({ position: { x: 150, y: 80 } });
    await page.getByRole('button', { name: 'Restablecer cámara' }).click();
    await expect.poll(() => camera.getAttribute('x')).toBe(initialCameraX);
    await expect.poll(() => camera.getAttribute('y')).toBe(initialCameraY);
    await expect(page.locator('.vi-phaser canvas')).toHaveCount(1);
  });

  test('shows the desktop-only warning below 1024 px', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto('/visual');
    await expect(page.getByRole('heading', { name: 'Resolución no compatible' })).toBeVisible();
  });

  test('supports the simulated join-room path', async ({ page }) => {
    await page.goto('/visual');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Unirse a una sala/ }).click();

    await expect(page.getByRole('heading', { name: 'Accede a la operación.' })).toBeVisible();
    await page.getByLabel('Código de sala').fill('ab12');
    await page.getByRole('button', { name: 'Acceder a la sala' }).click();
    await expect(page.getByText('AB12', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Iniciar operación' })).toBeDisabled();
  });

  test('saves local control and accessibility settings', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/visual');
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
    await page.getByLabel('Mover').selectOption('Q');
    await page.getByRole('button', { name: /Accesibilidad/ }).click();
    await page.getByLabel(/Contraste reforzado/).check();
    await page.getByRole('button', { name: 'Guardar ajustes' }).click();

    await expect(page.locator('.visual-app')).toHaveClass(/is-high-contrast/);
    await expect(page.getByText('Ajustes guardados localmente')).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('impulso.visual-preferences') ?? '{}'));
    expect(stored.controls.move).toBe('Q');
    expect(stored.accessibility.highContrast).toBe(true);
  });

  test('previews and saves a cosmetic-only hangar loadout', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto('/visual');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Hangar/ }).click();

    await expect(page.getByRole('heading', { name: 'Define tu firma visual.' })).toBeVisible();
    await expect(page.getByText('Solo cosmético · Sin ventajas').first()).toBeVisible();
    const previewBox = await page.locator('.vi-ship-preview').evaluate((element) => {
      const preview = element.getBoundingClientRect();
      const footer = document.querySelector('.vi-screen__footer')?.getBoundingClientRect();
      return { ...preview.toJSON(), clearsFooter: footer ? preview.bottom <= footer.top : false };
    });
    expect(previewBox.right).toBeLessThanOrEqual(1366);
    expect(previewBox.clearsFooter).toBe(true);

    await page.getByRole('button', { name: /Polar MK-II/ }).click();
    await expect(page.getByRole('button', { name: /Polar MK-II/ })).toContainText('Equipado');
    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect(page.getByText('Configuración guardada localmente')).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('impulso.cosmetic-loadout') ?? '{}'));
    expect(stored.hull).toBe('polar');
  });
});
