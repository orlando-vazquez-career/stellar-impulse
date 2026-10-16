import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { chooseOpening, gamePoint, minimapPoint, openApp, readBattlefieldCamera } from './helpers';

type MinimapClickEvidence = {
  at: number;
  client: { x: number; y: number };
  buttonRect: { x: number; y: number; width: number; height: number };
  svgPoint: { x: number; y: number };
  svgRect: { x: number; y: number; width: number; height: number } | null;
  viewBox: string | null;
  cameraRect: Record<string, string> | null;
};
type WindowWithMinimapEvidence = Window & { __e2eMinimapClick?: MinimapClickEvidence };

function serializableCamera(camera: Awaited<ReturnType<typeof readBattlefieldCamera>>) {
  return {
    isoWidth: camera.isoWidth, isoHeight: camera.isoHeight,
    worldOriginX: camera.worldOriginX, worldOriginY: camera.worldOriginY,
    tileOriginX: camera.tileOriginX, tileOriginY: camera.tileOriginY,
    mapWidth: camera.mapWidth, mapHeight: camera.mapHeight, yaw: camera.yaw,
    worldX: camera.worldX, worldY: camera.worldY, zoom: camera.zoom,
  };
}

/** Reconstruct the click handler's isoToPoint input from the actual browser click coordinates. */
function decodeMinimapClick(camera: Awaited<ReturnType<typeof readBattlefieldCamera>>, svgPoint: { x: number; y: number }) {
  const scale = 172 / camera.isoWidth;
  const offset = { x: 4 - camera.worldOriginX * scale, y: 4 + (172 - camera.isoHeight * scale) / 2 - camera.worldOriginY * scale };
  const world = { x: (svgPoint.x - offset.x) / scale, y: (svgPoint.y - offset.y) / scale };
  const deltaX = (world.x - camera.mapHeight * 32) / 32;
  const deltaY = (world.y - 64) / 16;
  const viewed = { x: (deltaX + deltaY) / 2, y: (deltaY - deltaX) / 2 };
  const grid = yawCell(viewed.x, viewed.y, camera.mapWidth, camera.mapHeight, -camera.yaw);
  return {
    world, grid, roundedGrid: { x: Math.round(grid.x), y: Math.round(grid.y) },
    insideMap: grid.x >= 0 && grid.x <= camera.mapWidth - 1 && grid.y >= 0 && grid.y <= camera.mapHeight - 1,
  };
}

function yawCell(x: number, y: number, width: number, height: number, radians: number) {
  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  const deltaX = x - centerX;
  const deltaY = y - centerY;
  return { x: centerX + deltaX * cosine - deltaY * sine, y: centerY + deltaX * sine + deltaY * cosine };
}

async function panSample(page: Page, cameraBefore: Awaited<ReturnType<typeof readBattlefieldCamera>>) {
  return page.evaluate(({ beforeX, beforeY }) => {
    const mapCamera = document.querySelector('.map-camera');
    const canvasElement = document.querySelector('.vi-phaser canvas');
    const canvas = canvasElement?.getBoundingClientRect();
    if (!mapCamera || !canvas) return {
      at: new Date().toISOString(), inside: false, cameraChanged: false,
      camera: null, point: null, canvas: null,
    };
    const number = (name: string) => Number(mapCamera.getAttribute(name));
    const camera = {
      worldX: number('data-world-x'), worldY: number('data-world-y'), zoom: number('data-zoom'),
      mapWidth: number('data-map-width'), mapHeight: number('data-map-height'), yaw: number('data-view-yaw'),
      tileOriginX: number('data-tile-origin-x'), tileOriginY: number('data-tile-origin-y'),
    };
    const centerX = (camera.mapWidth - 1) / 2;
    const centerY = (camera.mapHeight - 1) / 2;
    const deltaX = 18 - centerX;
    const deltaY = 18 - centerY;
    const viewed = {
      x: centerX + deltaX * Math.cos(camera.yaw) - deltaY * Math.sin(camera.yaw),
      y: centerY + deltaX * Math.sin(camera.yaw) + deltaY * Math.cos(camera.yaw),
    };
    const isoX = camera.tileOriginX + (viewed.x - viewed.y) * 32;
    const isoY = camera.tileOriginY + (viewed.x + viewed.y) * 16;
    const point = {
      x: canvas.x + (isoX - camera.worldX) * camera.zoom,
      y: canvas.y + (isoY - camera.worldY) * camera.zoom,
    };
    const canvasBox = { x: canvas.x, y: canvas.y, width: canvas.width, height: canvas.height };
    return {
      at: new Date().toISOString(),
      inside: point.x >= canvas.x && point.x <= canvas.right && point.y >= canvas.y && point.y <= canvas.bottom,
      cameraChanged: camera.worldX !== beforeX || camera.worldY !== beforeY,
      camera: { worldX: camera.worldX, worldY: camera.worldY, zoom: camera.zoom }, point, canvas: canvasBox,
    };
  }, { beforeX: cameraBefore.worldX, beforeY: cameraBefore.worldY });
}

async function attachMinimapFailure(page: Page, testInfo: TestInfo, cameraBefore: Awaited<ReturnType<typeof readBattlefieldCamera>>,
  target: { x: number; y: number }, plannedClick: { x: number; y: number }, samples: Awaited<ReturnType<typeof panSample>>[], latest: unknown) {
  const [click, cameraAfter, targetPoint, canvas, runtime] = await Promise.all([
    page.evaluate(() => (window as WindowWithMinimapEvidence).__e2eMinimapClick ?? null),
    readBattlefieldCamera(page),
    gamePoint(page, 18, 18),
    page.locator('.vi-phaser canvas').boundingBox(),
    page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      scroll: { x: scrollX, y: scrollY }, visibility: document.visibilityState,
      phaser: Object.fromEntries(Array.from(document.querySelector('.vi-phaser')?.attributes ?? [])
        .filter((attribute) => attribute.name.startsWith('data-')).map((attribute) => [attribute.name, attribute.value])),
      gameplay: Object.fromEntries(Array.from(document.querySelector('.vi-gameplay')?.attributes ?? [])
        .filter((attribute) => attribute.name.startsWith('data-')).map((attribute) => [attribute.name, attribute.value])),
    })),
  ]);
  const diagnostic = {
    targetCell: { x: 18, y: 18 },
    targetMinimapSvgPoint: target,
    plannedClickPositionInButton: plannedClick,
    cameraBefore: serializableCamera(cameraBefore),
    click,
    clickDecodedAs: click ? decodeMinimapClick(cameraAfter, click.svgPoint) : null,
    cameraAfter: serializableCamera(cameraAfter),
    targetCanvasPoint: targetPoint,
    canvas,
    targetInsideCanvas: !!canvas && targetPoint.x >= canvas.x && targetPoint.x <= canvas.x + canvas.width
      && targetPoint.y >= canvas.y && targetPoint.y <= canvas.y + canvas.height,
    runtime, latestPoll: latest, pollSamples: samples,
  };
  const body = JSON.stringify(diagnostic, null, 2);
  await testInfo.attach('minimap-pan-diagnostics.json', { body: Buffer.from(body), contentType: 'application/json' });
  console.error(`[e2e minimap pan diagnostics] ${body}`);
}

test.describe('visual lobby', () => {
  test('offers Espiral Estelar and Caos Estelar before launch', async ({ page }) => {
    await openApp(page);
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    const espiral = page.getByRole('button', { name: /Espiral Estelar/ });
    const caos = page.getByRole('button', { name: /Caos Estelar/ });
    await expect(espiral).toBeVisible();
    await expect(caos).toBeVisible();
    // The Sector 01 Tiled inspector is gone: the briefing only talks about the maps on offer.
    await expect(page.getByRole('button', { name: /Explorar mapa/ })).toHaveCount(0);
    await expect(page.locator('.vi-briefing')).not.toContainText(/Sector 01|Umbral Helios/);
    // The briefing draws the chosen map itself, not a placeholder.
    await expect(page.getByRole('img', { name: /Vista previa.*Espiral Estelar/ })).toHaveAttribute('data-map-id', 'espiral');
    await caos.click();
    await expect(caos).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.vi-briefing__data dd').first()).toHaveText('Caos Estelar');
    await expect(page.getByRole('img', { name: /Vista previa.*Caos Estelar/ })).toHaveAttribute('data-map-id', 'espiral-2');
  });

  test('presents the movement lab as a movement-only drill', async ({ page }) => {
    const earlyMessageWarnings: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'warning' && message.text().includes('onMessage() not registered')) earlyMessageWarnings.push(message.text());
    });
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/?testTimeScale=2&testSeed=42');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByRole('button', { name: /Laboratorio de movimiento/ }).click();

    await expect(page.locator('.vi-briefing__data > div').nth(1).locator('dd')).toHaveText('Practicar rutas y formaciones');
    await expect(page.locator('.vi-briefing__data')).not.toContainText('Duración estimada');
    await expect(page.locator('.vi-room .vi-difficulty')).toHaveCount(0);
    await expect(page.locator('.vi-room .vi-duration')).toHaveCount(0);

    await page.locator('.vi-ready-controls input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await expect(page.locator('.vi-movement-lab-banner')).toBeVisible();
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.vi-minimap .map-camera')).toHaveAttribute('data-map-width', '31');
    await expect(page.locator('.vi-resources, .vi-sector-status, .vi-production, .vi-tutorial')).toHaveCount(0);

    const start = await gamePoint(page, 4, 15);
    await page.mouse.click(start.x, start.y - 12);
    await expect(page.getByRole('heading', { name: 'Escuadrón INT-1' })).toBeVisible();
    const marker = page.locator('.map-ally').first();
    const before = [await marker.getAttribute('cx'), await marker.getAttribute('cy')];
    const destination = await gamePoint(page, 10, 15);
    await page.mouse.click(destination.x, destination.y, { button: 'right' });
    await expect(page.locator('.map-move-route')).toHaveCount(1);
    const route = await page.locator('.map-move-route').getAttribute('points');
    expect(route).toBeTruthy();
    await expect.poll(async () => [await marker.getAttribute('cx'), await marker.getAttribute('cy')])
      .not.toEqual(before);
    expect(earlyMessageWarnings).toEqual([]);
  });

  test('selects a discovered station and recalls it from a control group', async ({ page }, testInfo) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1366, height: 768 });
    await openApp(page, '/?testTimeScale=5&testSeed=42');
    await page.getByLabel('Identificador de comandante').fill('Vega');
    await page.getByRole('button', { name: 'Continuar como invitado' }).click();
    await page.getByRole('button', { name: /Preparar operación/ }).click();
    await page.getByRole('button', { name: /Trascendencia Estelar/ }).click();
    await page.locator('.vi-ready-controls input[type="checkbox"]').check();
    await page.getByRole('button', { name: 'Iniciar operación' }).click();
    await chooseOpening(page);
    await expect(page.locator('.vi-phaser')).toHaveAttribute('data-ready', 'true');

    const scoutPoint = await gamePoint(page, 18, 95);
    await page.mouse.click(scoutPoint.x, scoutPoint.y);
    await expect(page.locator('.vi-squad')).toBeVisible();

    // Center the battlefield over the far station, then order the selected scout there to reveal it.
    const minimapTarget = await minimapPoint(page, 18, 18);
    const cameraBeforePan = await readBattlefieldCamera(page);
    const minimapControl = page.locator('.vi-minimap__pan');
    const minimap = await minimapControl.boundingBox();
    if (!minimap) throw new Error('No minimap');
    const plannedClick = { x: minimapTarget.x / 180 * minimap.width, y: minimapTarget.y / 180 * minimap.height };
    await minimapControl.evaluate((element) => {
      const button = element as HTMLButtonElement;
      button.addEventListener('click', (event) => {
        const rect = button.getBoundingClientRect();
        const svg = button.querySelector('svg');
        const svgRect = svg?.getBoundingClientRect();
        const cameraRect = button.querySelector('.map-camera');
        const toBox = (box: DOMRect) => ({ x: box.x, y: box.y, width: box.width, height: box.height });
        (window as WindowWithMinimapEvidence).__e2eMinimapClick = {
          at: Date.now(),
          client: { x: event.clientX, y: event.clientY },
          buttonRect: toBox(rect),
          svgPoint: { x: (event.clientX - rect.left) / rect.width * 180, y: (event.clientY - rect.top) / rect.height * 180 },
          svgRect: svgRect ? toBox(svgRect) : null,
          viewBox: svg?.getAttribute('viewBox') ?? null,
          cameraRect: cameraRect ? Object.fromEntries(Array.from(cameraRect.attributes).map((attribute) => [attribute.name, attribute.value])) : null,
        };
      }, { capture: true, once: true });
    });
    await minimapControl.click({ position: plannedClick });
    // The camera can already show the target; only require a usable destination, not a changed camera value.
    const panSamples: Awaited<ReturnType<typeof panSample>>[] = [];
    let latestPan: Awaited<ReturnType<typeof panSample>> | null = null;
    let lastPanSampleAt = 0;
    try {
      await expect.poll(async () => {
        latestPan = await panSample(page, cameraBeforePan);
        if (Date.now() - lastPanSampleAt >= 500) {
          panSamples.push(latestPan);
          if (panSamples.length > 25) panSamples.shift();
          lastPanSampleAt = Date.now();
        }
        return { inside: latestPan.inside };
      // CI reached the valid view just after the old 10 s deadline; this single-evaluation poll
      // avoids dozens of separate CDP reads while Phaser is rendering.
      }, { timeout: 20000 }).toMatchObject({ inside: true });
    } catch (error) {
      await attachMinimapFailure(page, testInfo, cameraBeforePan, minimapTarget, plannedClick, panSamples, latestPan);
      throw error;
    }
    const destination = await gamePoint(page, 18, 18);
    await page.mouse.click(destination.x, destination.y, { button: 'right' });
    await expect(page.locator('.map-move-route')).toHaveCount(1, { timeout: 10000 });

    const stationMarker = page.locator('.map-node--station[data-node-id="station-1"]');
    await expect(stationMarker).toHaveAttribute('data-stale', 'false', { timeout: 45000 });
    const camera = await readBattlefieldCamera(page);
    const stationPoint = await gamePoint(page, Number(await stationMarker.getAttribute('data-cell-x')), Number(await stationMarker.getAttribute('data-cell-y')));
    // The dock is offset below its cell; this exposed rim avoids the scout near the centre.
    await page.mouse.click(stationPoint.x - 35 * camera.zoom, stationPoint.y + 9 * camera.zoom);
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-selected-station', 'station-1');
    await expect(page.locator('.vi-structure')).toBeVisible();

    await page.keyboard.press('Control+1');
    const clearPoint = await gamePoint(page, 22, 22);
    await page.mouse.click(clearPoint.x, clearPoint.y);
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-selected-station', '');
    await page.keyboard.press('1');
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-selected-station', 'station-1');
  });
});
