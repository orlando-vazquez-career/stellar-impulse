import { expect, test } from '@playwright/test';
import { gamePoint, gridDistanceFromMinimap, openApp, readBattlefieldCamera } from './helpers';

async function advanceMockCombat(page: import('@playwright/test').Page) {
  // Elapsed-time movement accepts steps up to 100 ms. Keep that bound while
  // skipping intermediate render frames; a slow renderer cannot lose game time.
  for (let step = 0; step < 200; step++) await page.clock.fastForward(100);
}

/** Overlaps, off-screen panels, page overflow and the smallest text of the match HUD. */
async function hudLayout(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const selectors = ['.vi-resources', '.vi-sector-status', '.vi-top-controls', '.vi-minimap', '.vi-squad'];
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
}

test.describe('visual battle', () => {
  test('loads the complete ship and top-down structure art set', async ({ page }) => {
    const assetStatuses = new Map<string, number>();
    page.on('response', (response) => {
      const pathname = new URL(response.url()).pathname;
      if (pathname.startsWith('/assets/game/')) assetStatuses.set(pathname, response.status());
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');

    const factions = ['blue', 'red', 'neutral'];
    const expected = [
      ...['ax7', 'explorer', 'frigate', 'bomber'].flatMap((ship) => factions.map((faction) => `/assets/game/ships/${ship}-${faction}.png`)),
      ...['command-base', 'nexus-core'].flatMap((structure) => factions.map((faction) => `/assets/game/structures/${structure}-top-${faction}.png`)),
      '/assets/game/structures/turret-base-neutral.png',
      '/assets/game/structures/turret-head-neutral.png',
    ];
    expect(assetStatuses.size).toBe(20);
    expect(expected.map((path) => assetStatuses.get(path))).toEqual(expected.map(() => 200));
    // Sector 01 has no pillar at the Core, so the top-down disc stands in for it rather than leaving it bare.
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-nexus', 'disc');
    await page.screenshot({ path: 'test-results/structures-top-down.png' });
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

    const layout = await hudLayout(page);
    expect(layout.overlaps).toEqual([]);
    expect(layout.outside).toEqual([]);
    expect(layout.overflow).toEqual([0, 0]);
    expect(layout.smallestText).toBeGreaterThanOrEqual(12);
    await expect(page.locator('.vi-actions')).toHaveCount(0);

    const minimap = page.locator('.vi-minimap');
    await minimap.getByRole('button', { name: 'Plegar' }).click();
    await expect(minimap.getByRole('img', { name: 'Minimapa' })).toBeHidden();
    await minimap.getByRole('button', { name: 'Expandir' }).click();
    await expect(minimap.getByRole('img', { name: 'Minimapa' })).toBeVisible();

    // The development panel sits behind its own button; its simulated clock moves the match tick.
    const gameplay = page.locator('.vi-gameplay');
    const tick = async () => Number(await gameplay.getAttribute('data-tick'));
    await page.getByRole('button', { name: 'Desarrollo' }).click();
    const development = page.getByRole('complementary', { name: 'Development Controls' });
    await expect(development).toBeVisible();
    await expect(page.getByLabel('Estado del Núcleo')).toHaveValue('locked');
    await development.getByLabel('Reloj simulado').check();
    const started = await tick();
    await expect.poll(tick, { timeout: 15000 }).toBeGreaterThan(started);

    // A contested Core says so in the sector panel, with its capture bar at the progress set here.
    await page.getByLabel('Estado del Núcleo').selectOption('contested');
    // The first slider of the panel is the Core's capture progress.
    const progress = development.getByRole('slider').first();
    await progress.focus();
    await page.keyboard.press('Home');
    for (let step = 0; step < 6; step++) await page.keyboard.press('PageUp');
    await expect(development.locator('output').first()).toHaveText('60%');
    const sector = page.locator('.vi-sector-status');
    await expect(sector).toContainText('Núcleo disputado');
    await expect(sector).toContainText('Ambos bandos dentro');
    await expect(sector.getByRole('progressbar', { name: 'Progreso de captura' })).toHaveJSProperty('value', 60);
    await development.getByRole('button', { name: 'Cerrar' }).click();
    await expect(development).toHaveCount(0);

    // The menu pauses the sandbox: the tick holds while it is open and moves again once Escape closes it.
    await page.getByRole('button', { name: 'Menú' }).click();
    const menu = page.getByRole('dialog', { name: 'Partida en pausa' });
    await expect(menu).toBeVisible();
    await expect(sector).toContainText('EN PAUSA');
    const paused = await tick();
    await page.waitForTimeout(2500);
    expect(await tick()).toBe(paused);
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);
    await expect(sector).not.toContainText('EN PAUSA');
    const resumed = await tick();
    await expect.poll(tick, { timeout: 15000 }).toBeGreaterThan(resumed);
  });

  test('keeps Tab inside the menu, guards unsaved settings and leaves Space to the match once it closes', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-resources')).toBeVisible();

    const menuButton = page.getByRole('button', { name: 'Menú' });
    const menu = page.getByRole('dialog', { name: 'Partida en pausa' });
    const sector = page.locator('.vi-sector-status');
    await menuButton.click();
    await expect(menu).toBeVisible();
    await expect(sector).toContainText('EN PAUSA');
    // Tab goes round Resume, Settings and Leave and never reaches the HUD behind the overlay.
    await expect(menu.getByRole('button', { name: 'Reanudar', exact: true })).toBeFocused();
    for (const name of ['Configuración', 'Salir', 'Reanudar']) {
      await page.keyboard.press('Tab');
      await expect(menu.getByRole('button', { name, exact: true })).toBeFocused();
    }
    await page.keyboard.press('Shift+Tab');
    await expect(menu.getByRole('button', { name: 'Salir', exact: true })).toBeFocused();

    // An unsaved setting: Escape asks first, and discarding it closes the menu and lifts the pause.
    await menu.getByRole('button', { name: 'Configuración', exact: true }).click();
    await page.getByRole('button', { name: /Accesibilidad/ }).click();
    await page.getByLabel(/Contraste reforzado/).check();
    await page.keyboard.press('Escape');
    const unsaved = page.getByRole('alertdialog', { name: 'Tienes cambios sin guardar' });
    await expect(unsaved).toBeVisible();
    await expect(page.locator('.vi-game-menu')).toHaveCount(1);
    await unsaved.getByRole('button', { name: 'Descartar cambios' }).click();
    await expect(page.locator('.vi-game-menu')).toHaveCount(0);
    await expect(sector).not.toContainText('EN PAUSA');

    // Opened with a click and closed with Resume or Escape, focus is not left on the Menu button: Space is the
    // camera shortcut and must not press that button and reopen the menu.
    for (const close of ['resume', 'escape'] as const) {
      await menuButton.click();
      await expect(menu).toBeVisible();
      if (close === 'resume') await menu.getByRole('button', { name: 'Reanudar', exact: true }).click();
      else await page.keyboard.press('Escape');
      await expect(page.locator('.vi-game-menu')).toHaveCount(0);
      await expect(menuButton).not.toBeFocused();
      await page.keyboard.press('Space');
      await page.waitForTimeout(800);
      await expect(page.locator('.vi-game-menu')).toHaveCount(0);
      await expect(sector).not.toContainText('EN PAUSA');
    }
  });

  test('keeps HUD modules inside 1366×768 with the larger interface text', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => localStorage.setItem('impulso.visual-preferences', JSON.stringify({ accessibility: { largeText: true } })));
    await openApp(page, '/visual?adapter=mock');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByLabel('Estoy listo para desplegar').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-resources')).toBeVisible();
    await expect(page.locator('.visual-app')).toHaveClass(/is-large-text/);

    const layout = await hudLayout(page);
    expect(layout.overlaps).toEqual([]);
    expect(layout.outside).toEqual([]);
    expect(layout.overflow).toEqual([0, 0]);
    expect(layout.smallestText).toBeGreaterThanOrEqual(12);
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

  test('stops a custom camera-pan chord when its modifier is released first', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.addInitScript(() => localStorage.setItem('impulso.visual-preferences', JSON.stringify({ controls: { panDown: ['Shift+KeyS'] } })));
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
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-active-action', '');
    const afterA = await camera.getAttribute('x');
    await page.keyboard.down('d');
    await expect.poll(() => camera.getAttribute('x')).not.toBe(afterA);
    await page.keyboard.up('d');
    const initialY = await camera.getAttribute('y');
    await page.keyboard.down('Shift');
    await page.keyboard.down('s');
    await expect.poll(() => camera.getAttribute('y')).not.toBe(initialY);
    await page.keyboard.up('Shift');
    // Pan velocity eases out after input is released; wait for sustained stability
    // so slower CI frames don't make this assertion depend on a fixed delay.
    let previousY = Number(await camera.getAttribute('y'));
    let stableWindows = 0;
    await expect.poll(async () => {
      await page.waitForTimeout(500);
      const currentY = Number(await camera.getAttribute('y'));
      stableWindows = Math.abs(currentY - previousY) < 0.2 ? stableWindows + 1 : 0;
      previousY = currentY;
      return stableWindows;
    }, { timeout: 10000, intervals: [50] }).toBeGreaterThanOrEqual(3);
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
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-active-action', '');
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
});
