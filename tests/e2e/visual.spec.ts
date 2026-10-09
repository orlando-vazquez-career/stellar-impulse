import { expect, test } from '@playwright/test';
import { gamePoint, gridDistanceFromMinimap, openApp, readBattlefieldCamera } from './helpers';

async function advanceMockCombat(page: import('@playwright/test').Page) {
  // Elapsed-time movement accepts steps up to 100 ms. Keep that bound while
  // skipping intermediate render frames; a slow renderer cannot lose game time.
  for (let step = 0; step < 200; step++) await page.clock.fastForward(100);
}

test.describe('visual interface foundation', () => {
  test('opens Visual as the only main entry and keeps the legacy lobby out', async ({ page }) => {
    await openApp(page, '/');
    await expect(page.getByRole('heading', { name: 'Toma el mando.' })).toBeVisible();
    await expect(page.locator('.panel--modes')).toHaveCount(0);
  });

  test('inspects the real Sector 01 Tiled map from Visual', async ({ page }) => {
    await openApp(page, '/');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByRole('button', { name: 'Explorar mapa Tiled' }).click();
    await expect(page.getByRole('heading', { name: 'Sector 01 · Umbral Helios' })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Mapa Tiled Sector 01' })).toHaveAttribute('data-map-size', '29x29');
    await expect(page.getByRole('img', { name: 'Mapa Tiled Sector 01' })).toHaveAttribute('data-atlas-ready', 'true');
    await expect(page.getByText(/Base A ·/)).toBeVisible();
    await expect(page.getByText('Nave · 3, 3')).toBeVisible();
    const canvas = page.getByRole('img', { name: 'Mapa Tiled Sector 01' });
    const size = await canvas.evaluate((element) => ({
      cssWidth: element.getBoundingClientRect().width,
      cssHeight: element.getBoundingClientRect().height,
      nativeWidth: (element as HTMLCanvasElement).width,
      nativeHeight: (element as HTMLCanvasElement).height,
    }));
    await canvas.click({ position: {
      x: (29 * 32 + (4 - 3) * 32) * size.cssWidth / size.nativeWidth,
      y: (64 + (4 + 3) * 16) * size.cssHeight / size.nativeHeight,
    } });
    await expect(page.getByText('Nave · 4, 3')).toBeVisible();
    const selected = page.getByText(/Casilla .* · (Transitable|Bloqueada)/);
    const before = await selected.innerText();
    await page.getByRole('img', { name: 'Mapa Tiled Sector 01' }).click({ position: { x: 510, y: 260 } });
    await expect(selected).not.toHaveText(before);
    await page.screenshot({ path: 'test-results/tiled-sector.png' });
    await page.getByRole('button', { name: 'Volver a preparación' }).click();
    await expect(page.getByRole('heading', { name: 'Configura la operación.' })).toBeVisible();
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
    await expect(page.getByText('Acciones', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancelar Esc' })).toBeDisabled();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-map-source', 'sector-01.tmj');
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-atlas-ready', 'true');
    await page.screenshot({ path: 'test-results/visual-sector.png' });
  });

  test('keeps HUD modules inside 1366×768 without overlap', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
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
    await expect(page.locator('.vi-resources')).toBeVisible();

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
    const consoleErrors: string[] = [];
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
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
    expect(Number(await camera.getAttribute('width'))).toBeLessThan(172);
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
    await expect.poll(async () => Math.abs(Number(await camera.getAttribute('x')) - Number(initialCameraX))).toBeLessThan(0.6);
    await expect.poll(async () => Math.abs(Number(await camera.getAttribute('y')) - Number(initialCameraY))).toBeLessThan(0.6);
    await expect(page.locator('.vi-phaser canvas')).toHaveCount(1);

    const initialWidth = Number(await camera.getAttribute('width'));
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, -350);
    await expect.poll(async () => Number(await camera.getAttribute('width'))).toBeLessThan(initialWidth);
    await page.getByRole('button', { name: 'Restablecer cámara' }).click();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    const beforeDrag = await camera.getAttribute('x');
    await page.mouse.down({ button: 'middle' });
    await page.mouse.move(box.x + box.width / 2 - 160, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up({ button: 'middle' });
    await expect.poll(() => camera.getAttribute('x')).not.toBe(beforeDrag);
    expect(consoleErrors).toEqual([]);
  });

  test('pans the game camera with WASD without activating attack', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');
    await page.mouse.move(680, 400);
    const camera = page.locator('.map-camera');
    const initialX = await camera.getAttribute('x');
    await page.keyboard.down('a');
    await expect.poll(() => camera.getAttribute('x')).not.toBe(initialX);
    await page.keyboard.up('a');
    await expect(page.getByRole('button', { name: 'Atacar Q' })).toHaveAttribute('aria-pressed', 'false');
    const afterA = await camera.getAttribute('x');
    await page.keyboard.down('d');
    await expect.poll(() => camera.getAttribute('x')).not.toBe(afterA);
    await page.keyboard.up('d');
    const initialY = await camera.getAttribute('y');
    await page.keyboard.down('w');
    await expect.poll(() => camera.getAttribute('y')).not.toBe(initialY);
    await page.keyboard.up('w');
    const afterW = await camera.getAttribute('y');
    await page.keyboard.down('s');
    await expect.poll(() => camera.getAttribute('y')).not.toBe(afterW);
    await page.keyboard.up('s');
  });

  test('selects with left click and moves with right click', async ({ page }) => {
    test.setTimeout(120000);
    // Control mock time rather than depending on runner frame rate.
    await page.clock.install();
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');

    const beta = await gamePoint(page, 13, 15);
    await page.mouse.click(beta.x, beta.y, { button: 'right' });
    await expect(page.getByRole('heading', { name: 'Escuadrón Alpha' })).toBeVisible();
    await page.mouse.click(beta.x, beta.y);
    await expect(page.getByRole('heading', { name: 'Escuadrón Beta' })).toBeVisible();
    const betaMarker = page.locator('.map-ally').nth(1);
    const startingX = await betaMarker.getAttribute('cx');
    const startingY = await betaMarker.getAttribute('cy');
    await expect(page.getByRole('button', { name: 'Mover M' })).toHaveAttribute('aria-pressed', 'false');
    const blocked = await gamePoint(page, 9, 13);
    await page.mouse.click(blocked.x, blocked.y, { button: 'right' });
    await expect(page.locator('.map-move-route')).toHaveCount(0);
    const destination = await gamePoint(page, 15, 13);
    await page.mouse.click(destination.x, destination.y);
    await expect(page.locator('.map-move-route')).toHaveCount(0);
    await expect(page.locator('.vi-squad')).toHaveCount(0);
    await page.mouse.click(beta.x, beta.y);
    await page.mouse.click(destination.x, destination.y, { button: 'right' });
    await expect(page.locator('.map-move-route')).toHaveCount(1);
    await expect(page.getByText('En movimiento')).toBeVisible();
    // The isometric minimap turns this diagonal grid move (13,15 → 15,13) into a horizontal one.
    await expect.poll(() => betaMarker.getAttribute('cx')).not.toBe(startingX);
    expect(startingY).not.toBeNull();
    const enemy = await gamePoint(page, 17, 14);
    await page.mouse.click(enemy.x, enemy.y, { button: 'right' });
    await expect(page.getByText('Atacando')).toBeVisible();
    await advanceMockCombat(page);
    await expect(page.locator('.map-enemy')).toHaveCount(0);
  });

  test('selects several allied ships by dragging and orders them together', async ({ page }) => {
    test.setTimeout(120000);
    await page.clock.install();
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');

    const first = await gamePoint(page, 12, 13);
    const second = await gamePoint(page, 13, 15);
    const third = await gamePoint(page, 12, 15);
    await page.mouse.move(Math.min(first.x, second.x, third.x) - 45, Math.min(first.y, second.y, third.y) - 50);
    await page.mouse.down();
    await page.mouse.move(Math.max(first.x, second.x, third.x) + 45, Math.max(first.y, second.y, third.y) + 30, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByText('3 unidades seleccionadas')).toBeVisible();
    const allies = page.locator('.map-ally');
    const starts = await allies.evaluateAll((markers) => markers.map((marker) => marker.getAttribute('cx')));
    const destination = await gamePoint(page, 15, 13);
    await page.mouse.click(destination.x, destination.y, { button: 'right' });
    await expect.poll(async () => allies.evaluateAll((markers) => markers.map((marker) => marker.getAttribute('cx'))))
      .not.toEqual(starts);
    await expect(page.getByText('3 unidades seleccionadas')).toBeVisible();
    const enemy = await gamePoint(page, 17, 14);
    await page.mouse.click(enemy.x, enemy.y, { button: 'right' });
    await advanceMockCombat(page);
    await expect(page.locator('.map-enemy')).toHaveCount(0);
  });

  test('shows the desktop-only warning below 1024 px', async ({ page }) => {
    await page.setViewportSize({ width: 1000, height: 800 });
    await page.goto('/visual?adapter=mock');
    await expect(page.getByRole('heading', { name: 'Resolución no compatible' })).toBeVisible();
  });

  test('keeps ships apart when right-clicking an occupied allied position', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');
    const destination = await gamePoint(page, 13, 15);
    await page.mouse.click(destination.x, destination.y, { button: 'right' });
    await expect(page.locator('.map-move-route')).toHaveCount(1);
    const view = await readBattlefieldCamera(page);
    for (let sample = 0; sample < 30; sample++) {
      const markers = await page.locator('.map-ally').evaluateAll((nodes) => nodes.map((node) =>
        ({ x: Number(node.getAttribute('cx')), y: Number(node.getAttribute('cy')) })));
      for (let i = 0; i < markers.length; i++) for (let j = i + 1; j < markers.length; j++) {
        expect(await gridDistanceFromMinimap(page, markers[i]!, markers[j]!, view)).toBeGreaterThanOrEqual(0.9 - 1e-6);
      }
      await page.waitForTimeout(100);
    }
    await expect(page.locator('.map-move-route')).toHaveCount(0);
    await page.screenshot({ path: 'test-results/ship-traffic.png' });
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
    await openApp(page, '/visual?adapter=mock');
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
    // A guest holds no NFT pieces: the premium voice opens its purchase detail instead of equipping.
    await page.getByRole('button', { name: 'Comentarista', exact: true }).click();
    await page.getByRole('button', { name: /Voz de Analista/ }).click();
    await expect(page.getByRole('button', { name: /Voz de Analista/ })).toContainText('4 XLM');
    await expect(page.locator('.vi-item-detail')).toContainText('Vincula una wallet para comprar.');
    await expect(page.locator('.vi-wallet-strip')).toContainText('Inicia sesión con tu cuenta');
    await page.getByRole('button', { name: 'Música', exact: true }).click();
    await page.getByRole('button', { name: /Iron Vanguard/ }).click();
    await page.getByRole('button', { name: 'Guardar configuración' }).click();
    await expect(page.getByText('Configuración guardada localmente')).toBeVisible();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('impulso.cosmetic-loadout') ?? '{}'));
    expect(stored.hull).toBe('polar');
    expect(stored.voice).toBe('voz-comandante');
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
  });
});
