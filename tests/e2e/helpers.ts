import { errors, expect, type Page } from '@playwright/test';

/** Open the animated login, which now includes the commander alias form. */
export async function openApp(page: Page, url = '/') {
  await page.goto(url);
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

export async function readBattlefieldCamera(page: Page) {
  const camera = page.locator('.map-camera');
  await expect(camera).toBeVisible();
  const number = async (name: string) => Number(await camera.getAttribute(name));
  return {
    camera,
    isoWidth: await number('data-iso-width'),
    isoHeight: await number('data-iso-height'),
    worldOriginX: await number('data-world-origin-x'),
    worldOriginY: await number('data-world-origin-y'),
    tileOriginX: await number('data-tile-origin-x'),
    tileOriginY: await number('data-tile-origin-y'),
    mapWidth: await number('data-map-width'),
    mapHeight: await number('data-map-height'),
    yaw: await number('data-view-yaw'),
    worldX: await number('data-world-x'),
    worldY: await number('data-world-y'),
    zoom: await number('data-zoom'),
  };
}

function minimapOffset(view: Awaited<ReturnType<typeof readBattlefieldCamera>>) {
  const scale = 172 / view.isoWidth;
  return {
    scale,
    x: 4 - view.worldOriginX * scale,
    y: 4 + (172 - view.isoHeight * scale) / 2 - view.worldOriginY * scale,
  };
}

/** Grid cell to canvas pixels, matching the yawed isometric projection. */
export async function gamePoint(page: Page, x: number, y: number) {
  const view = await readBattlefieldCamera(page);
  const rect = await page.locator('.vi-phaser canvas').boundingBox();
  if (!rect) throw new Error('No playable canvas');
  const viewed = yawCell(x, y, view.mapWidth, view.mapHeight, view.yaw);
  const isoX = view.tileOriginX + (viewed.x - viewed.y) * 32;
  const isoY = view.tileOriginY + (viewed.x + viewed.y) * 16;
  return { x: rect.x + (isoX - view.worldX) * view.zoom, y: rect.y + (isoY - view.worldY) * view.zoom };
}

export async function canvasPointFromMinimap(page: Page, cx: number, cy: number) {
  const view = await readBattlefieldCamera(page);
  const offset = minimapOffset(view);
  const rect = await page.locator('.vi-phaser canvas').boundingBox();
  if (!rect) throw new Error('No playable canvas');
  const worldX = (cx - offset.x) / offset.scale;
  const worldY = (cy - offset.y) / offset.scale;
  return { x: rect.x + (worldX - view.worldX) * view.zoom, y: rect.y + (worldY - view.worldY) * view.zoom };
}

/** Pass `view` when comparing many markers: the conversion only uses fixed map attributes, and
 * re-reading the camera for every pair is slow on a busy software renderer. */
export async function gridDistanceFromMinimap(page: Page, first: { x: number; y: number }, second: { x: number; y: number },
  known?: Awaited<ReturnType<typeof readBattlefieldCamera>>) {
  const view = known ?? await readBattlefieldCamera(page);
  const offset = minimapOffset(view);
  const toGrid = (marker: { x: number; y: number }) => {
    const worldX = (marker.x - offset.x) / offset.scale;
    const worldY = (marker.y - offset.y) / offset.scale;
    const deltaX = (worldX - view.tileOriginX) / 32;
    const deltaY = (worldY - view.tileOriginY) / 16;
    const viewed = { x: (deltaX + deltaY) / 2, y: (deltaY - deltaX) / 2 };
    const grid = yawCell(viewed.x, viewed.y, view.mapWidth, view.mapHeight, -view.yaw);
    return grid;
  };
  const a = toGrid(first);
  const b = toGrid(second);
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Pick an opening card, or verify the server's automatic pick if the offer expires. */
export async function chooseOpening(page: Page) {
  const cards = page.locator('.augment-opening .augment-card');
  await expect(cards).toHaveCount(3);
  const offered = await openingState(page);
  let clicked = true;
  try {
    await cards.first().click({ timeout: 10000 });
  } catch (error) {
    // A slow runner may miss the offer; other interaction errors must still fail.
    if (!(error instanceof errors.TimeoutError)) throw error;
    clicked = false;
  }
  try {
    // At normal speed the server allows 30 seconds; accelerated tests expire sooner.
    await expect(page.locator('.vi-gameplay')).toHaveAttribute('data-tick', /^[1-9]\d*$/, { timeout: 35000 });
  } catch (error) {
    // Tells a pick that never left the page apart from a server clock running behind the wall clock.
    console.log(`opening unresolved: click ${clicked ? 'sent' : 'timed out'}; offered ${JSON.stringify(offered)}; now ${JSON.stringify(await openingState(page))}`);
    throw error;
  }
  await expect(page.locator('.augment-opening')).toHaveCount(0, { timeout: 10000 });
}

/** The opening as the page shows it: the server's remaining time, a confirmed pick and any room notice. */
function openingState(page: Page) {
  return page.evaluate(() => ({
    at: Date.now(),
    timer: document.querySelector('.augment-timer')?.textContent ?? null,
    confirmed: Boolean(document.querySelector('.augment-wait')),
    notice: document.querySelector('.vi-notice')?.textContent ?? null,
    connection: document.querySelector('.vi-gameplay')?.getAttribute('data-connection') ?? null,
  }));
}
